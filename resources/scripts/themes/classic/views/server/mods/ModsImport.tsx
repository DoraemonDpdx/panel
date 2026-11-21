import { useId, type ChangeEvent, type FormEvent } from 'react';
import {
    Alert,
    Badge,
    Button,
    Card,
    Checkbox,
    FileInput,
    Input,
    Label,
    ListRow,
    PanelLink,
    Spinner,
    TextArea,
} from '@/sdk';
import type { PrismRow, ResolvedLinkItem, ServerModsModel } from '@/sdk/theme';
import { InlineError, PROVIDER_NAMES, Thumb } from './parts';

const MATCH_LABELS = { url: 'Link', filename: 'File', name: 'Name', none: 'No match' } as const;
const SIDE_LABELS = { server: 'Server', both: 'Both', unknown: 'Unverified', client: 'Client-only' } as const;
const SIDE_TONES = { server: 'success', both: 'success', unknown: 'warning', client: 'danger' } as const;
const KIND_LABELS = new Map([
    ['mod', 'Mod'],
    ['plugin', 'Plugin'],
    ['modpack', 'Modpack'],
    ['world', 'World'],
    ['shader', 'Shader'],
    ['resourcepack', 'Resource pack'],
]);

function LinkResult({ model, result }: { model: ServerModsModel; result: ResolvedLinkItem }) {
    return (
        <div className='flex flex-col gap-2'>
            <ListRow className='flex flex-wrap items-center gap-3'>
                <Thumb url={result.iconUrl} title={result.title} />
                <div className='min-w-0 flex-1'>
                    <p className='font-medium break-words'>{result.title}</p>
                    <p className='flex flex-wrap items-center gap-2 text-xs text-muted-foreground'>
                        <Badge size='sm' variant='soft'>
                            {KIND_LABELS.get(result.kind) ?? result.kind}
                        </Badge>
                        <span>{PROVIDER_NAMES[result.provider]}</span>
                        <Badge size='sm' variant='soft' tone={result.compatible ? 'success' : 'warning'}>
                            {result.compatible ? 'Compatible' : 'Not compatible'}
                        </Badge>
                    </p>
                </div>
                {result.installable && model.canInstall && (
                    <Button
                        size='xsmall'
                        isSecondary
                        color='grey'
                        onClick={model.import.link.install}
                        aria-label={`Choose a version of ${result.title}`}
                    >
                        Choose version
                    </Button>
                )}
            </ListRow>
            {result.reason && <Alert type='warning'>{result.reason}</Alert>}
        </div>
    );
}

function LinkCard({ model }: { model: ServerModsModel }) {
    const { link } = model.import;
    const id = useId();
    const submit = (event: FormEvent) => {
        event.preventDefault();
        void link.resolve();
    };

    return (
        <Card>
            <h2 className='mb-1 text-base font-medium'>Install from link</h2>
            <p className='mb-3 text-sm text-muted-foreground'>
                A mod or plugin opens its versions. A modpack or world link goes to the Software page.
            </p>
            <form onSubmit={submit} className='flex flex-wrap items-end gap-2'>
                <div className='flex min-w-0 flex-1 basis-60 flex-col gap-1'>
                    <Label htmlFor={id}>Paste a Modrinth or CurseForge link</Label>
                    <Input
                        id={id}
                        type='url'
                        inputMode='url'
                        placeholder='https://modrinth.com/mod/lithium'
                        value={link.url}
                        onChange={(event) => link.setUrl(event.currentTarget.value)}
                    />
                </div>
                <Button
                    type='submit'
                    size='small'
                    isSecondary
                    color='grey'
                    isLoading={link.resolving}
                    disabled={link.url.trim() === ''}
                >
                    Resolve
                </Button>
            </form>
            <div className='mt-3 flex flex-col gap-2' aria-live='polite'>
                {link.error && <InlineError message={link.error} />}
                {link.result && <LinkResult model={model} result={link.result} />}
            </div>
        </Card>
    );
}

function PrismRowItem({ model, row }: { model: ServerModsModel; row: PrismRow }) {
    const { prism } = model.import;
    const label = row.matched?.title ?? row.name;

    return (
        <ListRow
            as='li'
            className='flex flex-col items-stretch! gap-1 text-left'
            aria-disabled={!row.selectable || undefined}
        >
            <div className='flex items-start gap-3'>
                <Checkbox
                    className='mt-1'
                    aria-label={`Install ${label}`}
                    checked={row.ticked}
                    disabled={!row.selectable}
                    onChange={(ticked) => prism.toggle(row.line, ticked)}
                />
                <div className='flex min-w-0 flex-1 flex-col gap-1 sm:flex-row sm:items-center sm:gap-3'>
                    <div className='flex min-w-0 flex-1 items-center gap-2'>
                        {row.matched && <Thumb url={row.matched.iconUrl} title={row.matched.title} />}
                        <div className='min-w-0'>
                            <p className={`font-medium break-words ${row.clientOnly ? 'line-through' : ''}`}>{label}</p>
                            {row.matched && row.matched.title !== row.name && (
                                <p className='text-xs break-words text-muted-foreground'>From “{row.name}”</p>
                            )}
                        </div>
                    </div>
                    <div className='flex flex-wrap items-center gap-2'>
                        {row.matched && (
                            <Badge size='sm' variant='soft'>
                                {MATCH_LABELS[row.match]}
                            </Badge>
                        )}
                        {row.matched && SIDE_LABELS[row.side] && (
                            <Badge size='sm' variant='soft' tone={SIDE_TONES[row.side]}>
                                {SIDE_LABELS[row.side]}
                            </Badge>
                        )}
                    </div>
                </div>
            </div>
            {row.reason && <p className='pl-8 text-xs text-muted-foreground'>{row.reason}</p>}
        </ListRow>
    );
}

function PrismReview({ model, rows }: { model: ServerModsModel; rows: readonly PrismRow[] }) {
    const { prism } = model.import;

    return (
        <div className='mt-3 flex flex-col gap-3'>
            <div className='flex flex-wrap items-center gap-2'>
                <Button size='small' isSecondary color='grey' onClick={prism.selectAllCompatible}>
                    Select all compatible
                </Button>
                <p aria-live='polite' className='min-w-0 flex-1 text-sm text-muted-foreground'>
                    {prism.selectedCount} of {prism.total} will be installed
                </p>
                {model.canInstall && (
                    <Button
                        size='small'
                        isLoading={prism.installing}
                        disabled={prism.selectedCount === 0}
                        onClick={() => void prism.install()}
                    >
                        Install selected
                    </Button>
                )}
            </div>
            <p className='text-xs text-muted-foreground'>
                Client-only rows are listed but cannot be installed. Unverified rows could not be checked against
                Modrinth, so they start unticked.
            </p>
            <ul aria-label='Mods found in the list' className='flex flex-col gap-2'>
                {rows.map((row) => (
                    <PrismRowItem key={row.line} model={model} row={row} />
                ))}
            </ul>
        </div>
    );
}

function PrismCard({ model }: { model: ServerModsModel }) {
    const { prism } = model.import;
    const textId = useId();
    const fileId = useId();
    const pick = (event: ChangeEvent<HTMLInputElement>) => {
        const file = event.currentTarget.files?.[0];

        if (file) {
            void prism.loadFile(file);
        }

        event.currentTarget.value = '';
    };

    return (
        <Card>
            <h2 className='mb-1 text-base font-medium'>Import a Prism Launcher mod list</h2>
            <p className='mb-3 text-sm text-muted-foreground'>
                Paste the list from Prism&apos;s “Export mod list”, or choose the file. It is read in your browser and
                matched to server-side mods for this server.
            </p>
            <div className='flex flex-col gap-3'>
                <div className='flex flex-col gap-1'>
                    <Label htmlFor={textId}>Mod list</Label>
                    <TextArea
                        id={textId}
                        rows={6}
                        className='w-full font-mono'
                        placeholder='One mod per line, or a list exported as HTML, Markdown, JSON or CSV'
                        value={prism.text}
                        onChange={(event) => prism.setText(event.currentTarget.value)}
                    />
                </div>
                <div className='flex flex-wrap items-end gap-2'>
                    <div className='flex min-w-0 flex-col gap-1'>
                        <Label htmlFor={fileId}>Choose file</Label>
                        <FileInput id={fileId} accept='.txt,.md,.html,.json,.csv' onChange={pick} />
                    </div>
                    <Button
                        size='small'
                        isSecondary
                        color='grey'
                        isLoading={prism.previewing}
                        disabled={prism.text.trim() === ''}
                        onClick={() => void prism.preview()}
                    >
                        Preview
                    </Button>
                    {prism.rows && (
                        <Button.Text size='small' onClick={prism.clear}>
                            Clear
                        </Button.Text>
                    )}
                </div>
                {prism.error && <InlineError message={prism.error} />}
            </div>
            {prism.rows && prism.rows.length === 0 && (
                <Alert type='info' className='mt-3'>
                    No mods were found in that list.
                </Alert>
            )}
            {prism.rows && prism.rows.length > 0 && <PrismReview model={model} rows={prism.rows} />}
        </Card>
    );
}

export function ImportPanel({ model }: { model: ServerModsModel }) {
    return (
        <div className='flex min-w-0 flex-col gap-4'>
            <LinkCard model={model} />
            <PrismCard model={model} />
            <p className='text-sm text-muted-foreground'>
                Have a .mrpack?{' '}
                <PanelLink destination={model.mrpackDestination} className='text-foreground underline'>
                    Import it from Software › Modpacks
                </PanelLink>
                .
            </p>
        </div>
    );
}

/** One card at the foot of the page while a batch install runs, and after it. */
export function ImportTray({ model }: { model: ServerModsModel }) {
    const { tray } = model;

    if (!tray) {
        return null;
    }

    const noun = tray.count === 1 ? 'mod' : 'mods';
    const log = (
        <PanelLink destination={{ to: '/server/$id', params: { id: model.serverId } }} className='underline'>
            View log
        </PanelLink>
    );
    let body;

    if (tray.status === 'succeeded') {
        body = <Alert type='success'>{`${tray.count} ${noun} installed. Restart the server to load them.`}</Alert>;
    } else if (tray.status === 'failed') {
        body = (
            <Alert type='danger'>
                The import failed{tray.error ? `: ${tray.error}` : '.'} {log}
            </Alert>
        );
    } else if (tray.status === 'unknown') {
        body = <Alert type='warning'>Lost track of the import. {log}</Alert>;
    } else {
        body = (
            <p className='flex items-center gap-2 text-sm'>
                <Spinner size='small' />
                <span>
                    Installing {tray.count} {noun}…
                </span>
                {log}
            </p>
        );
    }

    return (
        <Card className='mt-4'>
            <div
                role='status'
                aria-live='polite'
                aria-label='Import progress'
                className='flex flex-wrap items-center gap-2'
            >
                <div className='min-w-0 flex-1'>{body}</div>
                {tray.status !== 'pending' && tray.status !== 'running' && (
                    <Button.Text size='xsmall' onClick={tray.dismiss}>
                        Dismiss
                    </Button.Text>
                )}
            </div>
        </Card>
    );
}
