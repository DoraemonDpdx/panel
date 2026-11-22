import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { useInstallOperation, usePrismInstall, usePrismPreview, useResolveLink } from '@/api/server/mods/import';
import {
    modsError,
    useChangeModVersion,
    useInstallMod,
    useInstalledMods,
    useModCategories,
    useModProject,
    useModSearch,
    useModsPlatform,
    useModVersions,
    useRemoveMod,
    useRemoveModEntry,
    useToggleMod,
} from '@/api/server/mods/queries';
import type {
    InstalledMod,
    ModPlatform,
    ModProviderName,
    ModSort,
    ModsError,
    ModVersion,
    PrismItem,
    ResolvedLink,
} from '@/api/server/mods/types';
import { sendPowerActionInput, useSendPowerAction } from '@/api/server/power/queries';
import { useCurrentServer } from '@/api/server/queries';
import { notifyHttpError } from '@/plugins/notifications';
import { usePanelNavigate } from '@/sdk/navigation';
import { usePermissions } from '@/plugins/usePermissions';
import { useServerStatus } from '@/state/server';
import { implementViews } from '../registry';
import { pageStatus, pageStatusFixtures } from '../pageStatus';
import { attempt } from './attempt';
import {
    chipLabel,
    categoryOptions,
    compatibleLines,
    filterInstalled,
    isSoftwareKind,
    loaderName,
    PROVIDER_NAMES,
    platformInfo,
    prismRow,
    preselectVersion,
    projectDetail,
    recommendedLines,
    requiredDependencies,
    resolvedItem,
    searchResults,
    softwareDestination,
    softwareSearch,
    versionItem,
} from './modsItems';
import type {
    InstalledFilter,
    ModPickerHeader,
    ModProjectDetail,
    ModResultItem,
    ModsPageModel,
    ModsTab,
    ModsTray,
    ServerModsModel,
} from './modsTypes';

const noInstalled: InstalledMod[] = [];
const noVersions: ModVersion[] = [];
const onlyModrinth: ModProviderName[] = ['modrinth'];
const DEBOUNCE_MS = 300;

type Target = {
    readonly mode: 'install' | 'change';
    readonly provider: ModProviderName;
    readonly projectId: string;
    readonly title: string;
    readonly header: ModPickerHeader;
    /** The file being changed, for `change`. */
    readonly filename: string | null;
    readonly id: number | null;
    /** A version a pasted link named, preselected when it is compatible. */
    readonly preferVersion?: string | null;
};

const useDebounced = <T>(value: T, delay: number): T => {
    const [debounced, setDebounced] = useState(value);

    useEffect(() => {
        const timer = setTimeout(() => setDebounced(value), delay);

        return () => clearTimeout(timer);
    }, [value, delay]);

    return debounced;
};

const sourceKey = (uuid: string) => `astrelyse:mods:source:${uuid}`;

const readSource = (uuid: string): ModProviderName => {
    try {
        return localStorage.getItem(sourceKey(uuid)) === 'curseforge' ? 'curseforge' : 'modrinth';
    } catch {
        return 'modrinth';
    }
};

const writeSource = (uuid: string, provider: ModProviderName) => {
    try {
        localStorage.setItem(sourceKey(uuid), provider);
    } catch {
        // Not remembering the source is no loss.
    }
};

/** A list file's text, read in the browser; it never leaves the page until the user previews it. */
const readText = (file: File): Promise<string> =>
    new Promise((resolveText, reject) => {
        const reader = new FileReader();

        reader.onload = () => resolveText(String(reader.result ?? ''));
        reader.onerror = () => reject(reader.error);
        reader.readAsText(file);
    });

const usePlatformQuery = () => {
    const server = useCurrentServer();
    const uuid = server?.attributes.uuid ?? '';
    const [canRead] = usePermissions('mods.read');

    return { uuid, query: useModsPlatform(uuid, canRead) };
};

function useModsPageModel(): ModsPageModel {
    const { query } = usePlatformQuery();

    return { ...pageStatus(query), title: query.data?.project_type === 'plugin' ? 'Plugins' : 'Mods' };
}

const findInstalled = (raw: readonly InstalledMod[], filename: string) =>
    raw.find((candidate) => candidate.filename === filename);

function useModsFilters(uuid: string, detected: ModPlatform | undefined) {
    const [versionOverride, setVersionOverride] = useState<string | null>(null);
    const [sort, setSort] = useState<ModSort>('relevance');
    const [category, setCategory] = useState<string | null>(null);
    const [chosenProvider, setChosenProvider] = useState<ModProviderName>(() => readSource(uuid));
    const [anyVersion, setAnyVersion] = useState(false);
    const providers = detected?.providers ?? onlyModrinth;
    const provider = providers.includes(chosenProvider) ? chosenProvider : 'modrinth';
    const latest = detected?.game_version === 'latest';
    const detectedVersion = detected?.resolved_game_version ?? (latest ? null : (detected?.game_version ?? null));
    const detectedLoader = detected?.platform ?? null;
    // The loader is never chosen here: it follows the server type, which changes on the Software page.
    const loader = detectedLoader;
    const gameVersion = versionOverride ?? detectedVersion;
    const overridden = versionOverride !== null;

    return {
        provider,
        providers,
        detectedLoader,
        detectedVersion,
        latest,
        loader,
        gameVersion,
        overridden,
        sort,
        anyVersion,
        category,
        setCategory: (value: string | null) => {
            setAnyVersion(false);
            setCategory(value);
        },
        setAnyVersion,
        setSort,
        setProvider: (next: ModProviderName) => {
            setAnyVersion(false);
            setCategory(null);
            setChosenProvider(next);
            writeSource(uuid, next);
        },
        setGameVersion: (value: string | null) => {
            setAnyVersion(false);
            setVersionOverride(value && value !== detectedVersion ? value : null);
        },
        reset: () => {
            setVersionOverride(null);
        },
    };
}

type Filters = ReturnType<typeof useModsFilters>;

const flagged = async (
    setter: (update: (current: ReadonlySet<string>) => ReadonlySet<string>) => void,
    key: string,
    work: () => Promise<unknown>
): Promise<boolean> => {
    setter((current) => new Set(current).add(key));

    try {
        await work();

        return true;
    } catch {
        // The mutation has already told the user.
        return false;
    } finally {
        setter((current) => {
            const next = new Set(current);

            next.delete(key);

            return next;
        });
    }
};

interface ActionsContext {
    uuid: string;
    target: Target | null;
    setTarget: (target: Target | null) => void;
    showInstalled: (title: string) => void;
    filters: Filters;
    installedRaw: readonly InstalledMod[];
    versions: readonly ModVersion[];
    canRestart: boolean;
}

const headerOf = (title: string, parts: Partial<ModPickerHeader> = {}): ModPickerHeader => ({
    title,
    iconUrl: null,
    author: null,
    description: null,
    pageUrl: null,
    ...parts,
});

/** The writes of the page, with the drawer they open, the files they are busy with and the restart notice they raise. */
function useModsActions({
    uuid,
    target,
    setTarget,
    showInstalled,
    filters,
    installedRaw,
    versions,
    canRestart,
}: ActionsContext) {
    const [blocked, setBlocked] = useState<{ readonly pageUrl: string | null } | null>(null);
    const [busy, setBusy] = useState<ReadonlySet<string>>(new Set());
    const [installing, setInstalling] = useState<ReadonlySet<string>>(new Set());
    const [restartNeeded, setRestartNeeded] = useState(false);
    const status = useServerStatus();
    const install = useInstallMod(uuid);
    const changeVersion = useChangeModVersion(uuid);
    const toggleMod = useToggleMod(uuid);
    const removeMod = useRemoveMod(uuid);
    const removeEntry = useRemoveModEntry(uuid);
    const { mutateAsync: power } = useSendPowerAction();

    // A restart in progress is the change taking effect.
    useEffect(() => {
        if (status === 'starting' || status === 'stopping') {
            setRestartNeeded(false);
        }
    }, [status]);

    const open = (next: Target | null) => {
        setBlocked(null);
        setTarget(next);
    };

    const restart = async () => {
        if (await attempt(() => power(sendPowerActionInput(uuid, 'restart')))) {
            setRestartNeeded(false);
        }
    };

    const changed = useCallback(() => setRestartNeeded(true), []);
    const run = async (key: string, work: () => Promise<unknown>) => {
        if (await flagged(setBusy, key, work)) {
            changed();
        }
    };

    const installVersion = async (snapshot: Target, versionId: string) => {
        const version = versions.find((candidate) => candidate.id === versionId);

        try {
            await flagged(setInstalling, snapshot.projectId, async () => {
                try {
                    await install.mutateAsync({
                        provider: snapshot.provider,
                        projectId: snapshot.projectId,
                        versionId,
                    });
                } catch (error) {
                    const failure = modsError(error);

                    if (failure.kind === 'not_distributable') {
                        setTarget(snapshot);
                        setBlocked({ pageUrl: failure.pageUrl ?? null });
                    }

                    throw error;
                }

                changed();
                toast.success(
                    `${snapshot.title} ${version?.version_number ?? ''} installed. Restart the server to load it.`.replace(
                        '  ',
                        ' '
                    ),
                    {
                        action: canRestart ? { label: 'Restart', onClick: () => void restart() } : undefined,
                    }
                );
            });
        } catch {
            // Reported above.
        }
    };

    const actions: ServerModsModel['actions'] = {
        openInstall: (result: ModResultItem) =>
            open({
                mode: 'install',
                provider: result.provider,
                projectId: result.projectId,
                title: result.title,
                header: headerOf(result.title, {
                    iconUrl: result.iconUrl,
                    author: result.author,
                    description: result.description,
                    pageUrl: result.pageUrl,
                }),
                filename: null,
                id: null,
            }),
        openChange: (filename) => {
            const mod = findInstalled(installedRaw, filename);

            if (mod?.id !== null && mod?.id !== undefined && mod.project_id) {
                open({
                    mode: 'change',
                    provider: mod.provider ?? 'modrinth',
                    projectId: mod.project_id,
                    title: mod.title || mod.filename,
                    header: headerOf(mod.title || mod.filename, { iconUrl: mod.icon_url, pageUrl: mod.page_url }),
                    filename: mod.filename,
                    id: mod.id,
                });
            }
        },
        closePicker: () => open(null),
        chooseVersion: async (versionId) => {
            if (!target) {
                return;
            }

            const snapshot = target;

            open(null);

            if (snapshot.mode === 'change' && snapshot.id !== null && snapshot.filename !== null) {
                const { id } = snapshot;

                await run(snapshot.filename, () =>
                    changeVersion.mutateAsync({ id, versionId, provider: snapshot.provider })
                );
            } else {
                await installVersion(snapshot, versionId);
            }
        },
        installDependency: async ({ projectId, versionId }) => {
            const provider = target?.provider ?? filters.provider;

            if (versionId === null) {
                open({
                    mode: 'install',
                    provider,
                    projectId,
                    title: projectId,
                    header: headerOf(projectId),
                    filename: null,
                    id: null,
                });

                return;
            }

            await run(`dependency:${projectId}`, () => install.mutateAsync({ provider, projectId, versionId }));
        },
        manage: showInstalled,
        update: async (filename) => {
            const mod = findInstalled(installedRaw, filename);

            if (mod?.id !== null && mod?.id !== undefined && mod.update) {
                const { id } = mod;
                const versionId = mod.update.version_id;

                await run(filename, () =>
                    changeVersion.mutateAsync({ id, versionId, provider: mod.provider ?? 'modrinth' })
                );
            }
        },
        updateAll: async () => {
            const updatable = installedRaw.filter((mod) => mod.id !== null && mod.update !== null);

            await updatable.reduce(
                (previous, mod) => previous.then(() => actions.update(mod.filename)),
                Promise.resolve()
            );
        },
        toggle: (filename, enabled) => run(filename, () => toggleMod.mutateAsync({ filename, enabled })),
        remove: (filename) => run(filename, () => removeMod.mutateAsync(filename)),
        removeEntry: async (filename) => {
            const id = findInstalled(installedRaw, filename)?.id;

            if (id !== null && id !== undefined) {
                await run(filename, () => removeEntry.mutateAsync(id));
            }
        },
        restart,
    };

    return {
        target,
        blocked,
        busy,
        installing,
        actions,
        restartNeeded,
        dismissRestart: () => setRestartNeeded(false),
        openTarget: open,
        markChanged: changed,
    };
}

const asError = (cause: unknown): ModsError | null => (cause ? modsError(cause) : null);

const browseError = (error: ModsError | null, provider: ModProviderName, providers: readonly ModProviderName[]) => {
    if (!error) {
        return null;
    }

    if (error.kind !== 'unavailable') {
        return error.message;
    }

    const other = providers.find((candidate) => candidate !== provider);

    return `${PROVIDER_NAMES[provider]} isn't responding. Try again${other ? ` or switch to ${PROVIDER_NAMES[other]}` : ''}.`;
};

const filtersModel = (
    filters: Filters,
    chip: string,
    categories: ServerModsModel['filters']['categories']
): ServerModsModel['filters'] => ({
    provider: filters.provider,
    providers: filters.providers,
    setProvider: filters.setProvider,
    loader: filters.loader,
    loaderLabel: loaderName(filters.loader),
    gameVersion: filters.gameVersion,
    chip,
    overridden: filters.overridden,
    reset: filters.reset,
    sort: filters.sort,
    setGameVersion: filters.setGameVersion,
    setSort: filters.setSort,
    category: filters.category,
    categories,
    setCategory: filters.setCategory,
});

interface BrowseInput {
    search: ReturnType<typeof useModSearch>;
    error: ModsError | null;
    filters: Filters;
    query: string;
    queryText: string;
    setQueryText: (value: string) => void;
    installing: ReadonlySet<string>;
    chip: string;
    sourceName: string;
}

const browseModel = ({
    search,
    error,
    filters,
    query,
    queryText,
    setQueryText,
    installing,
    chip,
    sourceName,
}: BrowseInput): ServerModsModel['browse'] => ({
    query: queryText,
    setQuery: (value) => {
        filters.setAnyVersion(false);
        setQueryText(value);
    },
    results: searchResults(search.data?.pages ?? [], installing),
    total: search.data?.pages[0]?.meta.total ?? 0,
    loading: search.isPending && !search.error,
    loadingMore: search.isFetchingNextPage,
    error,
    errorMessage: browseError(error, filters.provider, filters.providers),
    retry: () => void search.refetch(),
    hasMore: search.hasNextPage,
    loadMore: () => void search.fetchNextPage(),
    emptyMessage: query
        ? `No results for '${query}' on ${sourceName} for ${chip}.`
        : `Nothing found on ${sourceName} for ${chip}.`,
    anyVersion: filters.anyVersion,
    searchAllVersions: () => filters.setAnyVersion(true),
});

interface InstalledControls {
    status: InstalledFilter;
    setStatus: (status: InstalledFilter) => void;
    text: string;
    setText: (text: string) => void;
}

const installedModel = (
    query: ReturnType<typeof useInstalledMods>,
    raw: readonly InstalledMod[],
    busy: ReadonlySet<string>,
    controls: InstalledControls
): ServerModsModel['installed'] => ({
    items: filterInstalled(raw, busy, controls.status, controls.text),
    count: raw.length,
    loading: query.isPending && !query.error,
    error: asError(query.error),
    retry: () => void query.refetch(),
    diskUnavailable: query.data?.diskUnavailable ?? false,
    updatable: raw.filter((mod) => mod.id !== null && mod.update !== null).length,
    ...controls,
});

interface PickerInput {
    target: Target;
    installedMod: InstalledMod | undefined;
    installedRaw: readonly InstalledMod[];
    compatible: readonly ModVersion[];
    versionsQuery: ReturnType<typeof useModVersions>;
    blocked: { readonly pageUrl: string | null } | null;
    serverVersion: string | null;
    detail: ModProjectDetail;
}

const pickerModel = ({
    target,
    installedMod,
    installedRaw,
    compatible,
    versionsQuery,
    blocked,
    serverVersion,
    detail,
}: PickerInput): ServerModsModel['picker'] => {
    const error = asError(versionsQuery.error);

    return {
        open: true,
        mode: target.mode,
        title: target.title,
        header: target.header,
        detail,
        versions: compatible.map((version) =>
            versionItem(version, installedMod?.version_id === version.id, serverVersion)
        ),
        preselected: preselectVersion(installedMod, compatible, target.preferVersion),
        loading: versionsQuery.isPending && !error,
        error,
        retry: () => void versionsQuery.refetch(),
        blocked,
        provider: target.provider,
        dependencies: (versionId) =>
            requiredDependencies(
                compatible.find((version) => version.id === versionId),
                installedRaw
            ),
    };
};

interface ImportHooks {
    openProject: (target: Target) => void;
    markChanged: () => void;
}

/** The Import tab: a pasted link, a Prism Launcher list, and the batch install they start. */
function useModsImport(uuid: string, serverId: string, { openProject, markChanged }: ImportHooks) {
    const go = usePanelNavigate();
    const resolveLink = useResolveLink(uuid);
    const previewPrism = usePrismPreview(uuid);
    const installPrism = usePrismInstall(uuid);
    const [url, setUrl] = useState('');
    const [link, setLink] = useState<ResolvedLink | null>(null);
    const [linkError, setLinkError] = useState<string | null>(null);
    const [text, setText] = useState('');
    const [items, setItems] = useState<readonly PrismItem[] | null>(null);
    const [ticked, setTicked] = useState<ReadonlySet<number>>(new Set());
    const [prismError, setPrismError] = useState<string | null>(null);
    const [operation, setOperation] = useState<{ id: number | string; count: number } | null>(null);
    const operationQuery = useInstallOperation(uuid, operation?.id ?? null);
    const operationStatus = operationQuery.data?.status;

    // A finished batch is a change that needs a restart, noted once per operation.
    useEffect(() => {
        if (operationStatus === 'succeeded') {
            markChanged();
        }
    }, [operationStatus, operation?.id, markChanged]);

    const rows = items ? items.map((item) => prismRow(item, ticked.has(item.line))) : null;
    const selected = (rows ?? []).filter((row) => row.ticked);

    const resolve = async () => {
        const value = url.trim();

        if (value === '') {
            return;
        }

        setLinkError(null);
        setLink(null);

        try {
            const found = await resolveLink.mutateAsync(value);

            if (found.compatible && isSoftwareKind(found.kind)) {
                await go(softwareDestination(serverId, softwareSearch(found)));

                return;
            }

            setLink(found);
        } catch (error) {
            setLinkError(modsError(error).message);
        }
    };

    const preview = async () => {
        if (text.trim() === '') {
            return;
        }

        setPrismError(null);

        try {
            const found = await previewPrism.mutateAsync(text);

            setItems(found);
            setTicked(new Set(recommendedLines(found)));
        } catch (error) {
            setPrismError(modsError(error).message);
        }
    };

    const install = async () => {
        const body = (items ?? []).flatMap((item) =>
            ticked.has(item.line) && item.matched && prismRow(item, true).selectable
                ? [
                      {
                          provider: item.matched.provider,
                          project_id: item.matched.project_id,
                          version_id: item.matched.version_id,
                      },
                  ]
                : []
        );

        if (body.length === 0) {
            return;
        }

        try {
            const started = await installPrism.mutateAsync(body);

            setOperation({ id: started.id, count: body.length });
            setItems(null);
            setTicked(new Set());
        } catch (error) {
            notifyHttpError(error, 'Unable to start the import');
        }
    };

    let tray: ModsTray | null = null;

    if (operation) {
        tray = {
            status: operationStatus ?? (operationQuery.isError ? 'unknown' : 'pending'),
            count: operation.count,
            error: operationQuery.data?.error ?? null,
            dismiss: () => setOperation(null),
        };
    }

    const importModel: ServerModsModel['import'] = {
        link: {
            url,
            setUrl,
            resolving: resolveLink.isPending,
            resolve,
            result: link ? resolvedItem(link) : null,
            error: linkError,
            install: () => {
                if (link) {
                    openProject({
                        mode: 'install',
                        provider: link.provider,
                        projectId: link.project_id,
                        title: link.title,
                        header: headerOf(link.title, { iconUrl: link.icon_url }),
                        filename: null,
                        id: null,
                        preferVersion: link.version_id ?? null,
                    });
                }
            },
            clear: () => {
                setLink(null);
                setLinkError(null);
                setUrl('');
            },
        },
        prism: {
            text,
            setText,
            loadFile: async (file) => {
                setText(await readText(file));
                setItems(null);
                setPrismError(null);
            },
            previewing: previewPrism.isPending,
            preview,
            error: prismError,
            rows,
            selectedCount: selected.length,
            total: rows?.length ?? 0,
            toggle: (line, on) => {
                const row = rows?.find((candidate) => candidate.line === line);

                if (row?.selectable) {
                    setTicked((current) => {
                        const next = new Set(current);

                        if (on) {
                            next.add(line);
                        } else {
                            next.delete(line);
                        }

                        return next;
                    });
                }
            },
            selectAllCompatible: () => setTicked((current) => new Set([...current, ...compatibleLines(items ?? [])])),
            installing: installPrism.isPending,
            install,
            clear: () => {
                setItems(null);
                setTicked(new Set());
                setPrismError(null);
                setText('');
            },
        },
    };

    return { importModel, tray };
}

const useServerId = (): string => useCurrentServer()?.attributes.identifier ?? '';

/** Where the Software page is, and its `.mrpack` import. */
const softwareLinks = (serverId: string) => ({
    softwareDestination: softwareDestination(serverId),
    mrpackDestination: softwareDestination(serverId, { tab: 'modpacks', import: 'mrpack' }),
});

/** The reads behind the version drawer: the project's versions and its detail. */
function usePickerQueries(uuid: string, target: Target | null, filters: Filters) {
    const provider = target?.provider ?? filters.provider;
    const projectId = target?.projectId ?? null;
    const versionsQuery = useModVersions(uuid, projectId, { provider, gameVersion: filters.gameVersion });
    const projectQuery = useModProject(uuid, provider, projectId);

    return {
        versionsQuery,
        projectQuery,
        compatible: versionsQuery.data ?? noVersions,
        detail: projectDetail(projectQuery.data, projectQuery.isPending && !projectQuery.error),
    };
}

function useServerModsModel(): ServerModsModel {
    const serverId = useServerId();
    const { uuid, query: platformQuery } = usePlatformQuery();
    const [canInstall, canRestart] = usePermissions(['mods.install', 'control.restart']);
    const detected = platformQuery.data;
    const [tab, setTab] = useState<ModsTab>('installed');
    const [queryText, setQueryText] = useState('');
    const [status, setStatus] = useState<InstalledFilter>('all');
    const [text, setText] = useState('');
    const [target, setTarget] = useState<Target | null>(null);
    const query = useDebounced(queryText.trim(), DEBOUNCE_MS);
    const filters = useModsFilters(uuid, detected);
    const platform = platformInfo(
        detected,
        { detected: filters.detectedVersion, latest: filters.latest },
        filters.providers
    );
    const browsing = platform.eligible && tab === 'browse';
    const search = useModSearch(
        uuid,
        {
            provider: filters.provider,
            query,
            gameVersion: filters.anyVersion ? null : filters.gameVersion,
            sort: filters.sort,
            category: filters.category,
        },
        browsing
    );
    const categoriesQuery = useModCategories(uuid, filters.provider, browsing);
    const installedQuery = useInstalledMods(uuid, platform.eligible);
    const installedRaw = installedQuery.data?.data ?? noInstalled;
    const { versionsQuery, compatible, detail } = usePickerQueries(uuid, target, filters);
    const acts = useModsActions({
        uuid,
        target,
        setTarget,
        showInstalled: (title) => {
            setText(title);
            setStatus('all');
            setTab('installed');
        },
        filters,
        installedRaw,
        versions: compatible,
        canRestart,
    });
    const { importModel, tray } = useModsImport(uuid, serverId, {
        openProject: acts.openTarget,
        markChanged: acts.markChanged,
    });
    const platformError = asError(platformQuery.error);
    const installedMod = target?.mode === 'change' ? installedRaw.find((mod) => mod.id === target.id) : undefined;
    const chip = chipLabel(filters.loader, filters.gameVersion, {
        overridden: filters.overridden,
        latest: filters.latest && !filters.overridden,
    });

    return {
        loading: detected === undefined && !platformError,
        error: platformError,
        retry: () => void platformQuery.refetch(),
        platform,
        serverId,
        ...softwareLinks(serverId),
        canInstall,
        canRestart,
        tab,
        setTab,
        restartNeeded: acts.restartNeeded,
        dismissRestart: acts.dismissRestart,
        filters: filtersModel(filters, chip, categoryOptions(categoriesQuery.data, filters.provider)),
        browse: browseModel({
            search,
            error: asError(search.error),
            filters,
            query,
            queryText,
            setQueryText,
            installing: acts.installing,
            chip,
            sourceName: PROVIDER_NAMES[filters.provider],
        }),
        installed: installedModel(installedQuery, installedRaw, acts.busy, { status, setStatus, text, setText }),
        picker: target
            ? pickerModel({
                  target,
                  installedMod,
                  installedRaw,
                  compatible,
                  versionsQuery,
                  blocked: acts.blocked,
                  serverVersion: filters.detectedVersion,
                  detail,
              })
            : { open: false },
        import: importModel,
        tray,
        actions: acts.actions,
    };
}

const resolved = async () => {};

const noop = () => {};

const modsFixture = (options: Partial<ServerModsModel> = {}): ServerModsModel => ({
    loading: false,
    error: null,
    retry: noop,
    platform: {
        eligible: true,
        noun: 'mod',
        title: 'Mods',
        detectedLoader: 'fabric',
        detectedVersion: '1.21.1',
        versionIsLatest: false,
        installDir: 'mods',
        providers: ['modrinth', 'curseforge'],
    },
    serverId: 'a1b2c3d4',
    ...softwareLinks('a1b2c3d4'),
    canInstall: true,
    canRestart: true,
    tab: 'installed',
    setTab: noop,
    restartNeeded: false,
    dismissRestart: noop,
    filters: {
        provider: 'modrinth',
        providers: ['modrinth', 'curseforge'],
        setProvider: noop,
        loader: 'fabric',
        loaderLabel: 'Fabric',
        gameVersion: '1.21.1',
        chip: 'Fabric · 1.21.1',
        overridden: false,
        reset: noop,
        sort: 'relevance',
        setGameVersion: noop,
        setSort: noop,
        category: null,
        categories: [
            { value: 'optimization', label: 'Optimization' },
            { value: 'utility', label: 'Utility' },
        ],
        setCategory: noop,
    },
    browse: {
        query: '',
        setQuery: noop,
        results: [
            {
                projectId: 'AANobbMI',
                title: 'Sodium',
                description: 'A modern rendering engine.',
                iconUrl: null,
                downloads: 1200000,
                author: 'jellysquid3',
                categories: ['optimization'],
                updated: null,
                installed: true,
                installing: false,
                provider: 'modrinth',
                pageUrl: 'https://modrinth.com/mod/sodium',
                distributable: true,
                side: 'both',
            },
        ],
        total: 1,
        loading: false,
        loadingMore: false,
        error: null,
        errorMessage: null,
        retry: noop,
        hasMore: false,
        loadMore: noop,
        emptyMessage: "No results for 'xyz' on Modrinth for Fabric · 1.21.1.",
        anyVersion: false,
        searchAllVersions: noop,
    },
    installed: {
        items: [
            {
                filename: 'sodium-fabric-0.6.0.jar',
                id: 1,
                projectId: 'AANobbMI',
                title: 'Sodium',
                iconUrl: null,
                version: '0.6.0',
                enabled: true,
                tracked: true,
                missing: false,
                provider: 'modrinth',
                update: { versionId: 'v2', version: '0.6.1' },
                pageUrl: 'https://modrinth.com/mod/sodium',
                canChangeVersion: true,
                fromModpack: false,
                busy: false,
            },
            {
                filename: 'custom.jar.disabled',
                id: null,
                projectId: null,
                title: 'custom.jar.disabled',
                iconUrl: null,
                version: null,
                enabled: false,
                tracked: false,
                missing: false,
                update: null,
                provider: null,
                pageUrl: null,
                canChangeVersion: false,
                fromModpack: false,
                busy: false,
            },
        ],
        count: 2,
        loading: false,
        error: null,
        retry: noop,
        diskUnavailable: false,
        updatable: 1,
        status: 'all',
        setStatus: noop,
        text: '',
        setText: noop,
    },
    import: {
        link: {
            url: '',
            setUrl: noop,
            resolving: false,
            resolve: resolved,
            result: null,
            error: null,
            install: noop,
            clear: noop,
        },
        prism: {
            text: '',
            setText: noop,
            loadFile: resolved,
            previewing: false,
            preview: resolved,
            error: null,
            rows: null,
            selectedCount: 0,
            total: 0,
            toggle: noop,
            selectAllCompatible: noop,
            installing: false,
            install: resolved,
            clear: noop,
        },
    },
    tray: null,
    picker: { open: false },
    actions: {
        openInstall: noop,
        openChange: noop,
        closePicker: noop,
        chooseVersion: resolved,
        installDependency: resolved,
        manage: noop,
        update: resolved,
        updateAll: resolved,
        toggle: resolved,
        remove: resolved,
        removeEntry: resolved,
        restart: resolved,
    },
    ...options,
});

implementViews({
    'page.server.mods': {
        use: useModsPageModel,
        fixtures: {
            default: () => ({ ...pageStatusFixtures.default(), title: 'Mods' }),
            loading: () => ({ ...pageStatusFixtures.loading(), title: 'Mods' }),
            error: () => ({ ...pageStatusFixtures.error(), title: 'Mods' }),
        },
    },
    'server.mods': {
        use: useServerModsModel,
        fixtures: {
            installed: () => modsFixture(),
            browse: () => modsFixture({ tab: 'browse' }),
            import: () => modsFixture({ tab: 'import' }),
            readOnly: () => modsFixture({ canInstall: false }),
            unsupported: () =>
                modsFixture({
                    error: { kind: 'unsupported', message: 'This server does not support mods or plugins.' },
                }),
            loading: () => modsFixture({ loading: true }),
        },
    },
});
