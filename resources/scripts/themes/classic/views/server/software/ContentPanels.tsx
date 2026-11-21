import { useRef, useState, type ReactNode } from 'react';
import {
    Alert,
    Badge,
    Button,
    Card,
    Drawer,
    FileInput,
    Input,
    Label,
    ListRow,
    ProgressBar,
    Skeleton,
    Switch,
    Tabs,
    bytesToString,
    formatDate,
    fromNow,
} from '@/sdk';
import type {
    ContentBrowse,
    ContentHeader,
    ContentRowItem,
    ContentVersionItem,
    ImporterModel,
    ModpackDrawerModel,
    ServerSoftwareModel,
    WorldDrawerModel,
    WorldOptionsModel,
} from '@/sdk/theme';
import {
    compact,
    ConfirmDialog,
    EmptyNote,
    ExternalLinkText,
    InlineError,
    NamedSelect,
    RadioList,
    Skeletons,
    Thumb,
} from './shared';

const SORTS = [
    { value: 'relevance', label: 'Relevance' },
    { value: 'downloads', label: 'Downloads' },
    { value: 'updated', label: 'Recently updated' },
    { value: 'newest', label: 'Newest' },
];
const PROVIDER_NAMES = { modrinth: 'Modrinth', curseforge: 'CurseForge' } as const;
const VERSION_TONES = { release: 'neutral', beta: 'warning', alpha: 'danger' } as const;

function ContentRow({
    item,
    action,
    actionLabel,
}: {
    item: ContentRowItem;
    action: (() => void) | null;
    actionLabel: string;
}) {
    return (
        <ListRow as='li' className='flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3'>
            <div className='flex min-w-0 flex-1 items-start gap-3'>
                <Thumb url={item.iconUrl} title={item.title} />
                <div className='min-w-0 flex-1'>
                    <span className='block font-medium break-words'>{item.title}</span>
                    <p className='line-clamp-2 text-sm text-muted-foreground'>{item.description}</p>
                    <p className='flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground'>
                        <span>by {item.author}</span>
                        <span>{compact.format(item.downloads)} downloads</span>
                        {item.updated && <span>updated {fromNow(item.updated)}</span>}
                        {item.loader && (
                            <Badge size='sm' variant='soft'>
                                {item.loader}
                            </Badge>
                        )}
                        {item.minecraft && (
                            <Badge size='sm' variant='soft'>
                                Minecraft {item.minecraft}
                            </Badge>
                        )}
                        {item.categories.map((category) => (
                            <Badge key={category} size='sm' variant='soft'>
                                {category}
                            </Badge>
                        ))}
                    </p>
                </div>
            </div>
            {action && (
                <div className='flex shrink-0 items-center justify-end'>
                    <Button
                        size='xsmall'
                        isSecondary
                        color='grey'
                        onClick={action}
                        aria-label={`${actionLabel} ${item.title}`}
                    >
                        {actionLabel}
                    </Button>
                </div>
            )}
        </ListRow>
    );
}

function SourceSwitch({ browse }: { browse: ContentBrowse }) {
    if (browse.providers.length < 2) {
        return null;
    }

    return (
        <Tabs value={browse.provider} onValueChange={(value) => browse.setProvider(value as typeof browse.provider)}>
            <Tabs.List aria-label='Source'>
                {browse.providers.map((provider) => (
                    <Tabs.Tab key={provider} value={provider}>
                        {PROVIDER_NAMES[provider]}
                    </Tabs.Tab>
                ))}
            </Tabs.List>
        </Tabs>
    );
}

function BrowseResults({
    browse,
    noun,
    action,
    actionLabel,
}: {
    browse: ContentBrowse;
    noun: string;
    action: ((item: ContentRowItem) => void) | null;
    actionLabel: string;
}) {
    if (browse.unavailable) {
        return <EmptyNote title={`${noun} are not available`}>{browse.unavailable}</EmptyNote>;
    }

    if (browse.error) {
        return <InlineError message={browse.error} retry={browse.retry} />;
    }

    if (browse.loading) {
        return <Skeletons count={6} />;
    }

    if (browse.results.length === 0) {
        return <EmptyNote title='No results'>{browse.emptyMessage}</EmptyNote>;
    }

    return (
        <>
            <ul className='flex flex-col gap-2'>
                {browse.results.map((item) => (
                    <ContentRow
                        key={`${item.provider}:${item.projectId}`}
                        item={item}
                        actionLabel={actionLabel}
                        action={action ? () => action(item) : null}
                    />
                ))}
            </ul>
            {browse.loadingMore && <Skeletons count={2} />}
            {browse.hasMore && !browse.loadingMore && <Button.Text onClick={browse.loadMore}>Load more</Button.Text>}
        </>
    );
}

/** The search toolbar of a kind of content, with the button that imports a file of its own. */
function BrowseCard({
    id,
    noun,
    browse,
    importButton,
    action,
    actionLabel,
}: {
    id: string;
    noun: string;
    browse: ContentBrowse;
    importButton: ReactNode;
    action: ((item: ContentRowItem) => void) | null;
    actionLabel: string;
}) {
    return (
        <Card>
            <div className='flex flex-wrap items-end gap-2 pb-3'>
                <div className='flex min-w-0 flex-1 basis-full flex-col gap-1 sm:basis-60'>
                    <Label htmlFor={`${id}-search`} className='sr-only'>
                        Search {noun}
                    </Label>
                    <Input
                        id={`${id}-search`}
                        placeholder={`Search ${noun}`}
                        value={browse.query}
                        onChange={(event) => browse.setQuery(event.currentTarget.value)}
                    />
                </div>
                <NamedSelect
                    label='Sort'
                    value={browse.sort}
                    options={SORTS}
                    onChange={(value) => browse.setSort(value as typeof browse.sort)}
                />
                <SourceSwitch browse={browse} />
                {importButton}
            </div>
            <BrowseResults browse={browse} noun={noun} action={action} actionLabel={actionLabel} />
        </Card>
    );
}

/** A button that opens the file picker, then hands the chosen file to the importer. */
function ImportButton({ importer, label, busy }: { importer: ImporterModel; label: string; busy: boolean }) {
    const input = useRef<HTMLInputElement>(null);

    return (
        <>
            <Button
                size='small'
                isSecondary
                color='grey'
                isLoading={importer.uploading}
                disabled={busy}
                onClick={() => input.current?.click()}
            >
                {importer.uploading ? `Uploading${importer.progress === null ? '' : ` ${importer.progress}%`}` : label}
            </Button>
            <FileInput
                ref={input}
                hidden
                tabIndex={-1}
                aria-label={label}
                accept={importer.accept}
                onChange={(event) => {
                    const [file] = event.currentTarget.files ?? [];

                    event.currentTarget.value = '';

                    if (file) {
                        void importer.pick(file);
                    }
                }}
            />
            {importer.uploading && importer.progress !== null && (
                <div className='basis-full'>
                    <ProgressBar value={importer.progress} aria-label='Upload progress' />
                </div>
            )}
        </>
    );
}

function ContentHeaderBlock({ header }: { header: ContentHeader }) {
    return (
        <div className='flex items-start gap-3'>
            <Thumb url={header.iconUrl} title={header.title} />
            <div className='min-w-0 flex-1'>
                <p className='font-medium break-words'>{header.title}</p>
                {header.author && <p className='text-xs text-muted-foreground'>by {header.author}</p>}
                {header.description && (
                    <p className='line-clamp-2 text-sm text-muted-foreground'>{header.description}</p>
                )}
                {header.pageUrl && (
                    <ExternalLinkText href={header.pageUrl}>View on {PROVIDER_NAMES[header.provider]}</ExternalLinkText>
                )}
            </div>
        </div>
    );
}

function VersionPicker({
    versions,
    selected,
    onSelect,
    loading,
    error,
    retry,
    label,
}: {
    versions: readonly ContentVersionItem[];
    selected: string | null;
    onSelect: (id: string) => void;
    loading: boolean;
    error: string | null;
    retry: () => void;
    label: string;
}) {
    if (error) {
        return <InlineError message={error} retry={retry} />;
    }

    if (loading) {
        return <Skeletons count={3} />;
    }

    if (versions.length === 0) {
        return <EmptyNote title='No versions'>This project has no files to install.</EmptyNote>;
    }

    return (
        <RadioList
            label={label}
            value={selected}
            onChange={onSelect}
            options={versions.map((version) => ({
                value: version.id,
                content: (
                    <>
                        <span className='flex flex-wrap items-center gap-2'>
                            <span className='font-medium'>{version.number}</span>
                            <Badge
                                size='sm'
                                variant='soft'
                                tone={VERSION_TONES[version.type as keyof typeof VERSION_TONES] ?? 'neutral'}
                            >
                                {version.type}
                            </Badge>
                            {version.loader && (
                                <Badge size='sm' variant='soft'>
                                    {version.loader}
                                </Badge>
                            )}
                            {version.minecraft && (
                                <Badge size='sm' variant='soft'>
                                    Minecraft {version.minecraft}
                                </Badge>
                            )}
                        </span>
                        <span className='flex flex-wrap items-center gap-x-3 text-xs text-muted-foreground'>
                            <span>{formatDate(version.published, 'MMM D, YYYY')}</span>
                            {version.size !== null && <span>{bytesToString(version.size)}</span>}
                        </span>
                    </>
                ),
            }))}
        />
    );
}

function Preview({ drawer }: { drawer: ModpackDrawerModel }) {
    const { preview } = drawer;

    if (preview.error) {
        return <InlineError message={preview.error} retry={preview.retry} />;
    }

    if (preview.loading || !preview.data) {
        return preview.loading ? <Skeleton kind='row' /> : null;
    }

    const { data } = preview;

    return (
        <section aria-label='What this install does' className='flex flex-col gap-2'>
            <h3 className='text-sm font-medium'>What this install does</h3>
            <ListRow className='flex flex-col items-start! gap-1'>
                <span className='font-medium'>{data.counts}</span>
                <span className='text-sm text-muted-foreground'>Switches the server to {data.software}</span>
                {data.size && <span className='text-xs text-muted-foreground'>{data.size} to download</span>}
            </ListRow>
            {data.warnings.map((warning) => (
                <Alert key={warning} type='warning'>
                    {warning}
                </Alert>
            ))}
        </section>
    );
}

function ModpackDrawer({ drawer }: { drawer: ModpackDrawerModel }) {
    const blocked = drawer.selected === null || drawer.preview.loading || drawer.preview.error !== null;

    return (
        <Drawer
            open
            onClose={drawer.close}
            title={`Install ${drawer.header.title}`}
            footer={
                <>
                    <Button.Text onClick={drawer.close}>Cancel</Button.Text>
                    <Button disabled={blocked} onClick={() => void drawer.install()}>
                        Install
                    </Button>
                </>
            }
        >
            <div className='flex flex-col gap-4'>
                <ContentHeaderBlock header={drawer.header} />
                <VersionPicker
                    label='Versions'
                    versions={drawer.versions}
                    selected={drawer.selected}
                    onSelect={drawer.select}
                    loading={drawer.loading}
                    error={drawer.error}
                    retry={drawer.retry}
                />
                {drawer.selected !== null && <Preview drawer={drawer} />}
                <Switch
                    checked={drawer.fresh}
                    onChange={drawer.setFresh}
                    label='Start fresh (keep worlds)'
                    description='Deletes everything on the server except your worlds, then installs the pack. Turn it off to add the pack on top of what is there.'
                />
            </div>
        </Drawer>
    );
}

function ImportDialog({
    importer,
    title,
    children,
    danger,
    disabled,
}: {
    importer: ImporterModel;
    title: string;
    children: ReactNode;
    danger?: boolean;
    disabled?: boolean;
}) {
    if (!importer.uploaded) {
        return null;
    }

    return (
        <ConfirmDialog
            title={title}
            confirm='Install'
            danger={danger}
            pending={importer.installing}
            disabled={disabled}
            onClose={importer.cancel}
            onConfirm={() => void importer.confirm()}
        >
            <p className='break-words'>
                <span className='font-medium'>{importer.uploaded.name}</span> is uploaded and ready to install.
            </p>
            {children}
        </ConfirmDialog>
    );
}

export function ModpacksPanel({ model }: { model: ServerSoftwareModel }) {
    const { modpacks, canManage, busy } = model;

    return (
        <>
            {busy && canManage && (
                <Alert type='info' className='mb-4'>
                    An install is running. Wait for it to finish before starting another.
                </Alert>
            )}
            <BrowseCard
                id='modpacks'
                noun='modpacks'
                browse={modpacks}
                action={canManage && !busy ? modpacks.open : null}
                actionLabel='Install'
                importButton={
                    canManage && <ImportButton importer={modpacks.importer} label='Import .mrpack' busy={busy} />
                }
            />
            {modpacks.drawer && canManage && <ModpackDrawer drawer={modpacks.drawer} />}
            <ImportDialog importer={modpacks.importer} title='Import this modpack?'>
                <Switch
                    checked={modpacks.importer.fresh}
                    onChange={modpacks.importer.setFresh}
                    label='Start fresh (keep worlds)'
                    description='Deletes everything except your worlds before installing.'
                />
            </ImportDialog>
        </>
    );
}

function WorldOptions({ options }: { options: WorldOptionsModel }) {
    return (
        <section aria-label='How to install' className='flex flex-col gap-3'>
            <RadioList
                label='How to install the world'
                value={options.mode}
                onChange={(value) => options.setMode(value as typeof options.mode)}
                options={[
                    {
                        value: 'replace',
                        content: (
                            <>
                                <span className='font-medium'>Replace the current world</span>
                                <span className='text-sm text-muted-foreground'>
                                    The world the server uses now is swapped for this one.
                                </span>
                            </>
                        ),
                    },
                    {
                        value: 'new',
                        content: (
                            <>
                                <span className='font-medium'>Install alongside as a new world</span>
                                <span className='text-sm text-muted-foreground'>
                                    Your current world is not touched.
                                </span>
                            </>
                        ),
                    },
                ]}
            />
            {options.mode === 'replace' ? (
                <Switch
                    checked={options.backup}
                    onChange={options.setBackup}
                    label='Keep a backup copy of the current world'
                    description='It is renamed to world-backup with the date, not deleted.'
                />
            ) : (
                <Alert type='info'>{options.levelHint}</Alert>
            )}
        </section>
    );
}

function WorldDrawer({
    drawer,
    options,
    confirm,
}: {
    drawer: WorldDrawerModel;
    options: WorldOptionsModel;
    confirm: () => void;
}) {
    return (
        <Drawer
            open
            onClose={drawer.close}
            title={`Install ${drawer.header.title}`}
            footer={
                <>
                    <Button.Text onClick={drawer.close}>Cancel</Button.Text>
                    <Button disabled={drawer.selected === null} onClick={confirm}>
                        Install
                    </Button>
                </>
            }
        >
            <div className='flex flex-col gap-4'>
                <ContentHeaderBlock header={drawer.header} />
                <VersionPicker
                    label='Files'
                    versions={drawer.versions}
                    selected={drawer.selected}
                    onSelect={drawer.select}
                    loading={drawer.loading}
                    error={drawer.error}
                    retry={drawer.retry}
                />
                <WorldOptions options={options} />
            </div>
        </Drawer>
    );
}

export function WorldsPanel({ model }: { model: ServerSoftwareModel }) {
    const { worlds, canManage, busy } = model;
    const [confirming, setConfirming] = useState(false);
    const { drawer, options, importer } = worlds;

    return (
        <>
            {busy && canManage && (
                <Alert type='info' className='mb-4'>
                    An install is running. Wait for it to finish before starting another.
                </Alert>
            )}
            <BrowseCard
                id='worlds'
                noun='worlds'
                browse={worlds}
                action={canManage && !busy ? worlds.open : null}
                actionLabel='Install'
                importButton={canManage && <ImportButton importer={importer} label='Import world zip' busy={busy} />}
            />
            {drawer && canManage && (
                <WorldDrawer drawer={drawer} options={options} confirm={() => setConfirming(true)} />
            )}
            {confirming && drawer && (
                <ConfirmDialog
                    title={`Install ${drawer.header.title}?`}
                    confirm='Install'
                    danger={options.destructive}
                    onClose={() => setConfirming(false)}
                    onConfirm={() => {
                        setConfirming(false);
                        void drawer.install();
                    }}
                >
                    <p>{options.summary}</p>
                    {options.mode === 'new' && <p className='text-muted-foreground'>{options.levelHint}</p>}
                </ConfirmDialog>
            )}
            <ImportDialog importer={importer} title='Import this world?' danger={options.destructive}>
                <WorldOptions options={options} />
                <p className='text-sm text-muted-foreground'>{options.summary}</p>
            </ImportDialog>
        </>
    );
}
