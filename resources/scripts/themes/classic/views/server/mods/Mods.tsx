import { useId, useState, type KeyboardEvent, type ReactNode } from 'react';
import { MoreHorizontal } from 'lucide-react';
import {
    Alert,
    Badge,
    Button,
    Card,
    Code,
    Dialog,
    Drawer,
    DropdownMenu,
    DropdownMenuItem,
    Input,
    Label,
    ListRow,
    PageHeading,
    PanelLink,
    Select,
    Spinner,
    Switch,
    Tabs,
    Tooltip,
    bytesToString,
    formatDate,
    fromNow,
    type SelectProps,
} from '@/sdk';
import type {
    InstalledModItem,
    ModDependencyItem,
    ModResultItem,
    ModVersionItem,
    ServerModsModel,
    ViewProps,
} from '@/sdk/theme';
import { ImportPanel, ImportTray } from './ModsImport';
import ProjectDetail from './ProjectDetail';
import { EmptyNote, ExternalLinkText, InlineError, PROVIDER_NAMES, Skeletons, Thumb } from './parts';

const SORTS = [
    { value: 'relevance', label: 'Relevance' },
    { value: 'downloads', label: 'Downloads' },
    { value: 'updated', label: 'Recently updated' },
    { value: 'newest', label: 'Newest' },
];
const STATUSES = [
    { value: 'all', label: 'All' },
    { value: 'enabled', label: 'Enabled' },
    { value: 'disabled', label: 'Disabled' },
];
const VERSION_TONES = { release: 'neutral', beta: 'warning', alpha: 'danger' } as const;

const compact = new Intl.NumberFormat('en', { notation: 'compact' });

/** A select named for assistive technology; the name is shown only when `visible`. */
function NamedSelect({ label, visible, ...props }: { label: string; visible?: boolean } & SelectProps) {
    const id = useId();

    return (
        <div className='flex min-w-0 flex-col gap-1'>
            <Label htmlFor={id} className={visible ? undefined : 'sr-only'}>
                {label}
            </Label>
            <Select id={id} {...props} />
        </div>
    );
}

function RestartNotice({ model }: { model: ServerModsModel }) {
    if (!model.restartNeeded) {
        return null;
    }

    return (
        <div className='mb-4 flex flex-wrap items-start gap-2'>
            <Alert type='info' className='min-w-0 flex-1'>
                Changes take effect after a restart.
            </Alert>
            {model.canRestart && (
                <Button size='xsmall' isSecondary color='grey' onClick={() => void model.actions.restart()}>
                    Restart
                </Button>
            )}
            <Button.Text size='xsmall' onClick={model.dismissRestart}>
                Dismiss
            </Button.Text>
        </div>
    );
}

function PlatformBar({ model }: { model: ServerModsModel }) {
    const { filters, platform } = model;
    const [editing, setEditing] = useState(false);

    const chip = (
        <Badge variant='soft' tone={filters.overridden ? 'warning' : 'neutral'}>
            {filters.chip}
        </Badge>
    );

    if (!editing) {
        return (
            <div className='flex flex-wrap items-center gap-2'>
                {chip}
                <span className='text-xs text-muted-foreground'>
                    {filters.overridden ? 'Custom filters' : 'Detected from your server'}
                </span>
                <Button.Text size='xsmall' onClick={() => setEditing(true)} aria-label='Change game version'>
                    Change
                </Button.Text>
            </div>
        );
    }

    return (
        <div className='flex flex-wrap items-end gap-2'>
            {chip}
            <div className='flex min-w-0 flex-col gap-1'>
                <Label htmlFor='mods-game-version'>Game version</Label>
                <Input
                    id='mods-game-version'
                    className='w-32'
                    placeholder={platform.detectedVersion ?? 'Any version'}
                    value={filters.gameVersion ?? ''}
                    onChange={(event) => filters.setGameVersion(event.currentTarget.value.trim() || null)}
                />
            </div>
            <Button.Text
                size='xsmall'
                disabled={!filters.overridden}
                onClick={() => {
                    filters.reset();
                    setEditing(false);
                }}
            >
                Reset to detected
            </Button.Text>
            <Button.Text size='xsmall' onClick={() => setEditing(false)}>
                Done
            </Button.Text>
            <p className='basis-full text-xs text-muted-foreground'>
                {platform.title} are matched to {filters.loaderLabel}.{' '}
                <PanelLink destination={model.softwareDestination} className='text-foreground underline'>
                    Change the server type on the Software page
                </PanelLink>
                .
            </p>
        </div>
    );
}

function DeleteDialog({ model, mod, close }: { model: ServerModsModel; mod: InstalledModItem; close: () => void }) {
    const [pending, setPending] = useState(false);
    const dir = model.platform.installDir ?? `${model.platform.noun}s`;

    return (
        <Dialog.Confirm
            open
            onClose={close}
            title={`Delete ${mod.title}`}
            confirm='Delete'
            pending={pending}
            onConfirmed={() => {
                setPending(true);
                void model.actions.remove(mod.filename).finally(() => {
                    setPending(false);
                    close();
                });
            }}
        >
            Delete {mod.title} ({mod.filename})? The file is removed from /{dir}. This can&apos;t be undone.
        </Dialog.Confirm>
    );
}

function RowMenu({ model, mod, onDelete }: { model: ServerModsModel; mod: InstalledModItem; onDelete: () => void }) {
    return (
        <DropdownMenu
            triggerContent={
                <>
                    <MoreHorizontal className='size-4' aria-hidden />
                    <span className='sr-only'>More actions for {mod.title}</span>
                </>
            }
        >
            {mod.canChangeVersion && (
                <DropdownMenuItem onClick={() => model.actions.openChange(mod.filename)}>
                    Change version…
                </DropdownMenuItem>
            )}
            {mod.pageUrl && mod.provider && (
                <DropdownMenuItem render={<a href={mod.pageUrl} target='_blank' rel='noopener noreferrer' />}>
                    View on {PROVIDER_NAMES[mod.provider]} ↗
                </DropdownMenuItem>
            )}
            <DropdownMenuItem danger onClick={onDelete}>
                Delete…
            </DropdownMenuItem>
        </DropdownMenu>
    );
}

function RowTitle({ mod }: { mod: InstalledModItem }) {
    return (
        <div className='min-w-0 flex-1'>
            <div className='flex flex-wrap items-center gap-2'>
                {mod.tracked ? (
                    <span className='truncate font-medium'>{mod.title}</span>
                ) : (
                    <Code dark className='truncate'>
                        {mod.filename}
                    </Code>
                )}
                {mod.fromModpack && (
                    <Tooltip content='Installed as part of a modpack'>
                        <Badge size='sm' variant='soft' tone='info'>
                            Modpack
                        </Badge>
                    </Tooltip>
                )}
                {!mod.enabled && (
                    <Badge size='sm' variant='soft'>
                        Disabled
                    </Badge>
                )}
                {!mod.tracked && (
                    <Tooltip content="Added outside the panel, so version management isn't available">
                        <Badge size='sm' variant='soft'>
                            Untracked
                        </Badge>
                    </Tooltip>
                )}
                {mod.missing && (
                    <Badge size='sm' variant='soft' tone='danger'>
                        Missing on disk
                    </Badge>
                )}
            </div>
            {mod.tracked && (
                <p className='flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground'>
                    {mod.provider && (
                        <Badge size='sm' variant='soft' title={`From ${PROVIDER_NAMES[mod.provider]}`}>
                            {PROVIDER_NAMES[mod.provider]}
                        </Badge>
                    )}
                    {mod.version && <span>{mod.version}</span>}
                    <span className='min-w-0 truncate font-mono'>{mod.filename}</span>
                </p>
            )}
        </div>
    );
}

function RowControls({ model, mod }: { model: ServerModsModel; mod: InstalledModItem }) {
    const { actions } = model;
    const [deleting, setDeleting] = useState(false);
    const locked = mod.busy || model.installed.diskUnavailable;

    return (
        <div className='flex shrink-0 items-center gap-2'>
            {mod.missing && mod.tracked && (
                <Button.Text size='xsmall' disabled={mod.busy} onClick={() => void actions.removeEntry(mod.filename)}>
                    Remove entry
                </Button.Text>
            )}
            {mod.update && (
                <Button
                    size='xsmall'
                    isSecondary
                    color='grey'
                    disabled={locked}
                    onClick={() => void actions.update(mod.filename)}
                    aria-label={`Update ${mod.title} to ${mod.update.version}`}
                >
                    Update to {mod.update.version}
                </Button>
            )}
            <Switch
                aria-label={`${mod.enabled ? 'Disable' : 'Enable'} ${mod.title}`}
                checked={mod.enabled}
                disabled={locked}
                onChange={(enabled) => void actions.toggle(mod.filename, enabled)}
            />
            {mod.tracked ? (
                <RowMenu model={model} mod={mod} onDelete={() => setDeleting(true)} />
            ) : (
                <Button.Text size='xsmall' disabled={locked} onClick={() => setDeleting(true)}>
                    Delete
                </Button.Text>
            )}
            {deleting && <DeleteDialog model={model} mod={mod} close={() => setDeleting(false)} />}
        </div>
    );
}

function InstalledRow({ model, mod }: { model: ServerModsModel; mod: InstalledModItem }) {
    return (
        <ListRow as='li' className='flex flex-wrap items-center gap-3' aria-busy={mod.busy}>
            <div className={`flex min-w-0 flex-1 items-center gap-3 ${mod.enabled ? '' : 'opacity-60'}`}>
                <Thumb url={mod.iconUrl} title={mod.title} />
                <RowTitle mod={mod} />
            </div>
            {model.canInstall && <RowControls model={model} mod={mod} />}
        </ListRow>
    );
}

function InstalledEmpty({ model }: { model: ServerModsModel }) {
    const { installed, platform, filters } = model;

    if (installed.count > 0) {
        return <EmptyNote title='Nothing matches' />;
    }

    const sources = filters.providers.map((provider) => PROVIDER_NAMES[provider]).join(' and ');

    return (
        <EmptyNote
            title={`No ${platform.noun}s yet`}
            action={
                <Button size='small' isSecondary color='grey' onClick={() => model.setTab('browse')}>
                    Browse
                </Button>
            }
        >
            Browse {sources} to add some.
        </EmptyNote>
    );
}

function InstalledPanel({ model }: { model: ServerModsModel }) {
    const { installed, canInstall } = model;
    const ready = !installed.error && !installed.loading;

    return (
        <Card>
            <div className='flex flex-wrap items-end gap-2 pb-3'>
                <div className='flex min-w-0 flex-1 basis-48 flex-col gap-1'>
                    <Label htmlFor='mods-installed-filter' className='sr-only'>
                        Filter installed files
                    </Label>
                    <Input
                        id='mods-installed-filter'
                        placeholder='Filter by name'
                        value={installed.text}
                        onChange={(event) => installed.setText(event.currentTarget.value)}
                    />
                </div>
                <NamedSelect
                    label='Status'
                    value={installed.status}
                    options={STATUSES}
                    onChange={(value) => installed.setStatus(value as typeof installed.status)}
                />
                {canInstall && installed.updatable >= 2 && (
                    <Button size='small' isSecondary color='grey' onClick={() => void model.actions.updateAll()}>
                        Update all ({installed.updatable})
                    </Button>
                )}
            </div>
            {installed.diskUnavailable && (
                <Alert type='warning' className='mb-3'>
                    Can&apos;t reach the server&apos;s files right now. Showing what the panel installed.
                </Alert>
            )}
            {installed.error && <InlineError message={installed.error.message} retry={installed.retry} />}
            {!installed.error && installed.loading && <Skeletons count={4} />}
            {ready && installed.items.length === 0 && <InstalledEmpty model={model} />}
            {ready && installed.items.length > 0 && (
                <ul className='flex flex-col gap-2'>
                    {installed.items.map((mod) => (
                        <InstalledRow key={mod.filename} model={model} mod={mod} />
                    ))}
                </ul>
            )}
        </Card>
    );
}

function ResultAction({ model, result }: { model: ServerModsModel; result: ModResultItem }) {
    if (!result.distributable && result.pageUrl) {
        return <ExternalLinkText href={result.pageUrl}>Download on {PROVIDER_NAMES[result.provider]}</ExternalLinkText>;
    }

    if (result.installed) {
        return (
            <span className='flex items-center gap-2'>
                <Badge size='sm' variant='soft'>
                    Installed
                </Badge>
                <Button.Text
                    size='xsmall'
                    onClick={() => model.actions.manage(result.title)}
                    aria-label={`Manage ${result.title}`}
                >
                    Manage
                </Button.Text>
            </span>
        );
    }

    if (!model.canInstall) {
        return null;
    }

    return (
        <Button
            size='xsmall'
            isSecondary
            color='grey'
            isLoading={result.installing}
            disabled={result.installing}
            aria-busy={result.installing}
            onClick={() => model.actions.openInstall(result)}
            aria-label={`Install ${result.title}`}
        >
            {result.installing ? 'Installing…' : 'Install'}
        </Button>
    );
}

function ResultRow({ model, result }: { model: ServerModsModel; result: ModResultItem }) {
    return (
        <ListRow as='li' className='flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3'>
            <div className='flex min-w-0 flex-1 items-start gap-3'>
                <Thumb url={result.iconUrl} title={result.title} />
                <div className='min-w-0 flex-1'>
                    <span className='flex flex-wrap items-center gap-2'>
                        <span className='font-medium break-words'>{result.title}</span>
                        {result.side === 'unknown' && (
                            <Tooltip content="This file isn't on Modrinth, so whether it runs on a server couldn't be checked.">
                                <Badge size='sm' variant='soft' tone='warning'>
                                    Unverified
                                </Badge>
                            </Tooltip>
                        )}
                    </span>
                    <p className='line-clamp-2 text-sm text-muted-foreground'>{result.description}</p>
                    <p className='flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground'>
                        <span>by {result.author}</span>
                        <span>{compact.format(result.downloads)} downloads</span>
                        {result.updated && <span>updated {fromNow(result.updated)}</span>}
                        {result.categories.map((category) => (
                            <Badge key={category} size='sm' variant='soft'>
                                {category}
                            </Badge>
                        ))}
                    </p>
                </div>
            </div>
            <div className='flex shrink-0 items-center justify-end'>
                <ResultAction model={model} result={result} />
            </div>
        </ListRow>
    );
}

function SourceSwitch({ model }: { model: ServerModsModel }) {
    const { filters } = model;

    if (filters.providers.length < 2) {
        return null;
    }

    return (
        <Tabs value={filters.provider} onValueChange={(value) => filters.setProvider(value as typeof filters.provider)}>
            <Tabs.List aria-label='Source'>
                {filters.providers.map((provider) => (
                    <Tabs.Tab key={provider} value={provider}>
                        {PROVIDER_NAMES[provider]}
                    </Tabs.Tab>
                ))}
            </Tabs.List>
        </Tabs>
    );
}

function BrowseResults({ model }: { model: ServerModsModel }) {
    const { browse } = model;

    if (browse.error) {
        return <InlineError message={browse.errorMessage ?? browse.error.message} retry={browse.retry} />;
    }

    if (browse.loading) {
        return <Skeletons count={6} />;
    }

    if (browse.results.length === 0) {
        return (
            <EmptyNote
                title='No results'
                action={
                    !browse.anyVersion && (
                        <Button size='small' isSecondary color='grey' onClick={browse.searchAllVersions}>
                            Search all versions
                        </Button>
                    )
                }
            >
                {browse.emptyMessage}
            </EmptyNote>
        );
    }

    return (
        <>
            <ul className='flex flex-col gap-2'>
                {browse.results.map((result) => (
                    <ResultRow key={`${result.provider}:${result.projectId}`} model={model} result={result} />
                ))}
            </ul>
            {browse.loadingMore && <Skeletons count={2} />}
            {browse.hasMore && !browse.loadingMore && <Button.Text onClick={browse.loadMore}>Load more</Button.Text>}
        </>
    );
}

function CategoryChip({ active, onSelect, children }: { active: boolean; onSelect: () => void; children: ReactNode }) {
    return (
        <Button
            size='xsmall'
            color='grey'
            isSecondary={active}
            aria-pressed={active}
            className='shrink-0'
            onClick={onSelect}
        >
            {children}
        </Button>
    );
}

function CategoryChips({ model }: { model: ServerModsModel }) {
    const { filters } = model;

    if (filters.categories.length === 0) {
        return null;
    }

    return (
        <div role='group' aria-label='Category' className='-mx-1 mb-3 flex max-w-full gap-2 overflow-x-auto px-1 pb-1'>
            <CategoryChip active={filters.category === null} onSelect={() => filters.setCategory(null)}>
                All
            </CategoryChip>
            {filters.categories.map((category) => (
                <CategoryChip
                    key={category.value}
                    active={filters.category === category.value}
                    onSelect={() => filters.setCategory(category.value)}
                >
                    {category.label}
                </CategoryChip>
            ))}
        </div>
    );
}

function BrowsePanel({ model }: { model: ServerModsModel }) {
    const { browse, filters } = model;

    return (
        <Card>
            <div className='flex flex-wrap items-end gap-2 pb-3'>
                <div className='flex min-w-0 flex-1 basis-full flex-col gap-1 sm:basis-60'>
                    <Label htmlFor='mods-search' className='sr-only'>
                        Search
                    </Label>
                    <Input
                        id='mods-search'
                        placeholder={`Search ${model.platform.noun}s`}
                        value={browse.query}
                        onChange={(event) => browse.setQuery(event.currentTarget.value)}
                    />
                </div>
                <NamedSelect
                    label='Sort'
                    value={filters.sort}
                    options={SORTS}
                    onChange={(value) => filters.setSort(value as typeof filters.sort)}
                />
                <SourceSwitch model={model} />
            </div>
            <CategoryChips model={model} />
            <BrowseResults model={model} />
        </Card>
    );
}

function VersionRow({
    version,
    selected,
    onSelect,
    onKeyDown,
}: {
    version: ModVersionItem;
    selected: boolean;
    onSelect: () => void;
    onKeyDown: (event: KeyboardEvent<HTMLElement>) => void;
}) {
    const { compatibility } = version;

    return (
        <ListRow
            role='radio'
            aria-checked={selected}
            tabIndex={selected ? 0 : -1}
            onClick={onSelect}
            onKeyDown={onKeyDown}
            className='flex cursor-pointer flex-col items-start! gap-1 text-left aria-checked:ring-2 aria-checked:ring-ring focus-visible:outline-2'
        >
            <span className='flex flex-wrap items-center gap-2'>
                <span className='font-medium'>{version.number}</span>
                <Badge
                    size='sm'
                    variant='soft'
                    tone={VERSION_TONES[version.type as keyof typeof VERSION_TONES] ?? 'neutral'}
                >
                    {version.type}
                </Badge>
                {version.current && (
                    <Badge size='sm' variant='soft' tone='info'>
                        Current
                    </Badge>
                )}
            </span>
            <span className='flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground'>
                <span>{formatDate(version.published, 'MMM D, YYYY')}</span>
                <span>{bytesToString(version.size)}</span>
                <Tooltip content={compatibility.full}>
                    <Badge size='sm' variant='soft' tone={compatibility.tone}>
                        {compatibility.label}
                    </Badge>
                </Tooltip>
            </span>
        </ListRow>
    );
}

function DependencyList({
    dependencies,
    actions,
}: {
    dependencies: readonly ModDependencyItem[];
    actions: ServerModsModel['actions'];
}) {
    if (dependencies.length === 0) {
        return null;
    }

    return (
        <section aria-label='Required dependencies'>
            <h3 className='mb-2 text-sm font-medium'>Required dependencies</h3>
            <ul className='flex flex-col gap-2'>
                {dependencies.map((dependency) => (
                    <ListRow as='li' key={dependency.projectId} className='flex items-center justify-between gap-2'>
                        <code className='truncate text-xs'>{dependency.projectId}</code>
                        {dependency.installed ? (
                            <Badge size='sm' variant='soft' tone='success'>
                                Installed ✓
                            </Badge>
                        ) : (
                            <Button
                                size='xsmall'
                                isSecondary
                                color='grey'
                                aria-label={`Install dependency ${dependency.projectId}`}
                                onClick={() => void actions.installDependency(dependency)}
                            >
                                Install
                            </Button>
                        )}
                    </ListRow>
                ))}
            </ul>
        </section>
    );
}

function DrawerHeader({ model }: { model: ServerModsModel }) {
    const { picker } = model;

    if (!picker.open) {
        return null;
    }

    const { header } = picker;

    return (
        <div className='mb-4 flex items-start gap-3'>
            <Thumb url={header.iconUrl} title={header.title} />
            <div className='min-w-0 flex-1'>
                <p className='font-medium'>{header.title}</p>
                {header.author && <p className='text-xs text-muted-foreground'>by {header.author}</p>}
                {header.description && (
                    <p className='line-clamp-2 text-sm text-muted-foreground'>{header.description}</p>
                )}
                {header.pageUrl && (
                    <ExternalLinkText href={header.pageUrl}>View on {PROVIDER_NAMES[picker.provider]}</ExternalLinkText>
                )}
            </div>
        </div>
    );
}

function DrawerBody({
    model,
    selected,
    onSelect,
}: {
    model: ServerModsModel;
    selected: string | null;
    onSelect: (id: string) => void;
}) {
    const { picker, actions } = model;

    if (!picker.open) {
        return null;
    }

    const ids = picker.versions.map((version) => version.id);
    const move = (event: KeyboardEvent<HTMLElement>) => {
        const index = ids.indexOf(selected ?? '');
        const step = { ArrowDown: 1, ArrowRight: 1, ArrowUp: -1, ArrowLeft: -1 }[event.key];

        if (step === undefined) {
            return;
        }

        event.preventDefault();

        const next = ids[(index + step + ids.length) % ids.length];

        if (next !== undefined) {
            onSelect(next);
            event.currentTarget.parentElement?.querySelector<HTMLElement>(`[data-version='${next}']`)?.focus();
        }
    };

    let list: ReactNode;

    if (picker.error) {
        list = <InlineError message={picker.error.message} retry={picker.retry} />;
    } else if (picker.loading) {
        list = <Spinner size='large' centered />;
    } else if (picker.versions.length === 0) {
        list = <EmptyNote title='No compatible versions'>Nothing matches this loader and game version.</EmptyNote>;
    } else {
        list = (
            <div role='radiogroup' aria-label='Versions' className='flex flex-col gap-2'>
                {picker.versions.map((version) => (
                    <div key={version.id} data-version={version.id} tabIndex={-1} className='contents'>
                        <VersionRow
                            version={version}
                            selected={version.id === selected}
                            onSelect={() => onSelect(version.id)}
                            onKeyDown={move}
                        />
                    </div>
                ))}
            </div>
        );
    }

    return (
        <div className='flex flex-col gap-4'>
            <DrawerHeader model={model} />
            <ProjectDetail detail={picker.detail} />
            {list}
            <DependencyList dependencies={selected ? picker.dependencies(selected) : []} actions={actions} />
        </div>
    );
}

function DrawerFooter({
    model,
    selected,
    close,
}: {
    model: ServerModsModel;
    selected: string | null;
    close: () => void;
}) {
    const { picker, actions } = model;

    if (!picker.open) {
        return null;
    }

    const target = picker.versions.find((version) => version.id === selected);
    const link = picker.blocked?.pageUrl ?? (target && !target.distributable ? target.pageUrl : null);
    const blocked = picker.blocked !== null || (target !== undefined && !target.distributable);

    return (
        <>
            <Button.Text onClick={close}>Cancel</Button.Text>
            {blocked ? (
                link && <ExternalLinkText href={link}>Download on {PROVIDER_NAMES[picker.provider]}</ExternalLinkText>
            ) : (
                <Button
                    disabled={!target || target.current}
                    onClick={() => selected && void actions.chooseVersion(selected)}
                >
                    {picker.mode === 'change' ? 'Use this version' : 'Install'}
                </Button>
            )}
        </>
    );
}

function VersionDrawer({ model }: { model: ServerModsModel }) {
    const { picker, actions } = model;
    const [chosen, setChosen] = useState<string | null>(null);

    if (!picker.open) {
        return null;
    }

    const selected = chosen ?? picker.preselected;
    const close = () => {
        setChosen(null);
        actions.closePicker();
    };

    return (
        <Drawer
            open
            onClose={close}
            title={picker.mode === 'change' ? `Change version of ${picker.title}` : `Install ${picker.title}`}
            footer={<DrawerFooter model={model} selected={selected} close={close} />}
        >
            <DrawerBody model={model} selected={selected} onSelect={setChosen} />
        </Drawer>
    );
}

export default function Mods({ model, className }: ViewProps<'server.mods'>) {
    const { platform, installed } = model;

    if (model.loading) {
        return (
            <div className={className}>
                <Spinner size='large' centered />
            </div>
        );
    }

    if (model.error) {
        return (
            <div className={className}>
                <InlineError
                    message={model.error.message}
                    retry={model.error.kind === 'unsupported' ? undefined : model.retry}
                />
            </div>
        );
    }

    if (!platform.eligible) {
        return (
            <div className={className}>
                <EmptyNote title='Not available'>This server does not run a mod loader or plugin platform.</EmptyNote>
            </div>
        );
    }

    const sources = model.filters.providers.map((provider) => PROVIDER_NAMES[provider]).join(' and ');

    return (
        <div className={`${className ?? ''} min-w-0 max-w-full`}>
            <PageHeading
                title={platform.title}
                description={`Install and manage ${platform.noun}s from ${sources}.`}
                actions={<PlatformBar model={model} />}
            />
            <Tabs value={model.tab} onValueChange={(tab) => model.setTab(tab as typeof model.tab)}>
                <Tabs.List aria-label={`${platform.title} sections`}>
                    <Tabs.Tab value='installed'>
                        Installed
                        <Badge size='sm' variant='soft'>
                            {installed.count}
                        </Badge>
                    </Tabs.Tab>
                    <Tabs.Tab value='browse'>Browse</Tabs.Tab>
                    <Tabs.Tab value='import'>Import</Tabs.Tab>
                </Tabs.List>
                <Tabs.Panel value='installed' className='min-w-0 pt-4'>
                    <RestartNotice model={model} />
                    <InstalledPanel model={model} />
                </Tabs.Panel>
                <Tabs.Panel value='browse' className='min-w-0 pt-4'>
                    <RestartNotice model={model} />
                    <BrowsePanel model={model} />
                </Tabs.Panel>
                <Tabs.Panel value='import' className='min-w-0 pt-4'>
                    <RestartNotice model={model} />
                    <ImportPanel model={model} />
                </Tabs.Panel>
            </Tabs>
            <ImportTray model={model} />
            <VersionDrawer model={model} />
        </div>
    );
}
