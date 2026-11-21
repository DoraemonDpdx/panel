import { useEffect, useRef, useState } from 'react';
import axios from 'axios';
import { toast } from 'sonner';
import {
    contentError,
    useImportModpack,
    useImportWorld,
    useInstallModpack,
    useInstallWorld,
    useModpackPreview,
    useModpackSearch,
    useModpackVersions,
    useWorldSearch,
    useWorldVersions,
    type ContentError,
    type ContentVersion,
    type ContentProvider,
    type ContentSort,
    type WorldMode,
} from '@/api/server/content/queries';
import { useUploadFiles } from '@/api/server/files/queries';
import type { SoftwareTypeInfo } from '@/api/server/software/types';
import { PROVIDER_NAMES } from './modsItems';
import { attempt } from './attempt';
import { contentRows, levelHint, previewView, versionItem, worldSummary } from './softwareItems';
import type { PreselectedItem } from './softwareSearch';
import type {
    ContentBrowse,
    ContentHeader,
    ContentRowItem,
    ImporterModel,
    ModpackDrawerModel,
    ModpacksModel,
    WorldOptionsModel,
    WorldsModel,
} from './softwareTypes';

export const UPLOAD_DIRECTORY = '/.astrelyse/uploads';
const DEBOUNCE_MS = 300;
const noop = () => {};

const useDebounced = <T>(value: T, delay: number): T => {
    const [debounced, setDebounced] = useState(value);

    useEffect(() => {
        const timer = setTimeout(() => setDebounced(value), delay);

        return () => clearTimeout(timer);
    }, [value, delay]);

    return debounced;
};

/** A source that cannot be reached, as opposed to one that refused the request. */
const isOutage = (cause: unknown): boolean =>
    axios.isAxiosError(cause) && (cause.response === undefined || cause.response.status >= 500);

interface BrowseInput {
    readonly noun: string;
    /** The sources this kind of content has. */
    readonly providers: readonly ContentProvider[];
    readonly search: ReturnType<typeof useModpackSearch>;
    readonly provider: ContentProvider;
    readonly setProvider: (provider: ContentProvider) => void;
    readonly query: string;
    readonly queryText: string;
    readonly setQueryText: (value: string) => void;
    readonly sort: ContentSort;
    readonly setSort: (sort: ContentSort) => void;
    readonly open: (item: ContentRowItem) => void;
    /** The panel is known to lack the source's key. */
    readonly missingKey: boolean;
}

const unavailableNote = (provider: ContentProvider) =>
    `${PROVIDER_NAMES[provider]} isn't set up on this panel. An administrator can add its API key in the advanced settings.`;

/** The message of a search that failed: a source that is down says so, anything else keeps the API's words. */
const failureMessage = (
    failure: ContentError,
    cause: unknown,
    provider: ContentProvider,
    providers: readonly ContentProvider[]
): string => {
    if (!isOutage(cause)) {
        return failure.message;
    }

    const other = providers.find((candidate) => candidate !== provider);

    return `${PROVIDER_NAMES[provider]} isn't responding. Try again${other ? ` or switch to ${PROVIDER_NAMES[other]}` : ''}.`;
};

const browseOf = (input: BrowseInput): ContentBrowse => {
    const { noun, providers, search, provider, query, queryText } = input;
    const failure = search.error ? contentError(search.error) : null;
    const unavailable = input.missingKey || failure?.kind === 'provider_unavailable' ? unavailableNote(provider) : null;
    const showFailure = failure !== null && failure.kind !== 'provider_unavailable';

    return {
        providers,
        provider,
        setProvider: input.setProvider,
        query: queryText,
        setQuery: input.setQueryText,
        sort: input.sort,
        setSort: input.setSort,
        results: contentRows(search.data?.pages ?? []),
        total: search.data?.pages[0]?.meta.total ?? 0,
        loading: search.isPending && !search.error && unavailable === null,
        loadingMore: search.isFetchingNextPage,
        error: showFailure ? failureMessage(failure, search.error, provider, providers) : null,
        unavailable,
        retry: () => void search.refetch(),
        hasMore: search.hasNextPage,
        loadMore: () => void search.fetchNextPage(),
        emptyMessage: query
            ? `No ${noun} found for '${query}' on ${PROVIDER_NAMES[provider]}.`
            : `No ${noun} found on ${PROVIDER_NAMES[provider]}.`,
        open: input.open,
    };
};

const headerOf = (target: Target, fallback: string): ContentHeader => ({
    title: target.title ?? fallback,
    iconUrl: target.iconUrl,
    author: target.author,
    description: target.description,
    pageUrl: target.pageUrl,
    provider: target.provider,
});

interface Target {
    readonly provider: ContentProvider;
    readonly projectId: string;
    readonly title: string | null;
    readonly iconUrl: string | null;
    readonly author: string | null;
    readonly description: string | null;
    readonly pageUrl: string | null;
    /** The version a link names. */
    readonly versionId: string | null;
}

const targetOf = (item: ContentRowItem): Target => ({
    provider: item.provider,
    projectId: item.projectId,
    title: item.title,
    iconUrl: item.iconUrl,
    author: item.author,
    description: item.description,
    pageUrl: item.pageUrl,
    versionId: null,
});

const linkedTarget = (item: PreselectedItem): Target => ({
    provider: item.provider,
    projectId: item.projectId,
    title: item.title,
    iconUrl: item.iconUrl,
    author: null,
    description: null,
    pageUrl: null,
    versionId: item.versionId,
});

/** The item of `?modpack=` or `?world=`, opened once per link. */
const useLinkedTarget = (
    item: PreselectedItem | null,
    kind: PreselectedItem['kind'],
    open: (target: Target) => void
) => {
    const key = item?.kind === kind ? `${item.provider}:${item.projectId}:${item.versionId ?? ''}` : null;
    const seen = useRef<string | null>(null);
    const opener = useRef(open);

    opener.current = open;

    useEffect(() => {
        if (key !== null && item && key !== seen.current) {
            seen.current = key;
            opener.current(linkedTarget(item));
        }
    }, [key, item]);
};

/** Uploads a file into the install container's folder; resolves the server path, or null when it did not upload. */
function useContentUpload(uuid: string, uploadSizeMb: number) {
    const { mutateAsync } = useUploadFiles();
    const [uploading, setUploading] = useState(false);
    const [progress, setProgress] = useState<number | null>(null);

    const upload = async (file: File, extensions: readonly string[]): Promise<string | null> => {
        if (!extensions.some((extension) => file.name.toLowerCase().endsWith(extension))) {
            toast.error(`Choose a ${extensions.join(' or ')} file.`);

            return null;
        }

        if (file.size > uploadSizeMb * 1024 * 1024) {
            toast.error(`${file.name} is larger than the ${uploadSizeMb} MiB upload limit.`);

            return null;
        }

        setUploading(true);
        setProgress(0);

        try {
            const { failed } = await mutateAsync({
                uuid,
                directory: UPLOAD_DIRECTORY,
                files: [file],
                callbacks: {
                    onFileQueued: () => {},
                    onFileProgress: (_id, event) =>
                        setProgress(event.total ? Math.round((event.loaded / event.total) * 100) : null),
                    onFileSettled: () => {},
                },
            });

            return failed.length > 0 ? null : `${UPLOAD_DIRECTORY}/${file.name}`;
        } catch {
            // The upload has already told the user.
            return null;
        } finally {
            setUploading(false);
            setProgress(null);
        }
    };

    return { upload, uploading, progress };
}

interface ImporterInput {
    readonly uuid: string;
    readonly uploadSizeMb: number;
    readonly extensions: readonly string[];
    /** Starts the import; rejects when the API refuses. */
    readonly start: (path: string) => Promise<unknown>;
}

function useImporter({ uuid, uploadSizeMb, extensions, start }: ImporterInput): ImporterModel {
    const { upload, uploading, progress } = useContentUpload(uuid, uploadSizeMb);
    const [uploaded, setUploaded] = useState<{ name: string; path: string } | null>(null);
    const [installing, setInstalling] = useState(false);

    return {
        accept: extensions.join(','),
        uploading,
        progress,
        uploaded,
        installing,
        pick: async (file) => {
            const path = await upload(file, extensions);

            setUploaded(path === null ? null : { name: file.name, path });
        },
        confirm: async () => {
            if (!uploaded) {
                return;
            }

            setInstalling(true);

            if (await attempt(() => start(uploaded.path))) {
                setUploaded(null);
            }

            setInstalling(false);
        },
        cancel: () => setUploaded(null),
    };
}

interface VersionsSource {
    readonly data: readonly ContentVersion[] | undefined;
    readonly isPending: boolean;
    readonly error: unknown;
    readonly refetch: () => unknown;
}

/** A project's versions, with the one to install: the user's pick, else the one a link names, else the newest. */
const versionsView = (query: VersionsSource, chosen: string | null, wanted: string | null) => {
    const versions = (query.data ?? []).map(versionItem);
    const linked = versions.find((version) => version.id === wanted)?.id;

    return {
        versions,
        selected: chosen ?? linked ?? versions[0]?.id ?? null,
        loading: query.isPending && !query.error,
        error: query.error ? contentError(query.error).message : null,
        retry: () => void query.refetch(),
    };
};

type VersionsView = ReturnType<typeof versionsView>;

const previewModel = (
    selected: string | null,
    query: ReturnType<typeof useModpackPreview>,
    types: readonly SoftwareTypeInfo[]
): ModpackDrawerModel['preview'] => ({
    loading: selected !== null && query.isPending && !query.error,
    error: query.error ? contentError(query.error).message : null,
    retry: () => void query.refetch(),
    data: query.data ? previewView(query.data, types) : null,
});

/** What both drawers share: the project's header and its versions. */
const drawerBase = (
    target: Target,
    fallback: string,
    view: VersionsView,
    select: (id: string) => void,
    close: () => void
) => ({
    header: headerOf(target, fallback),
    versions: view.versions,
    loading: view.loading,
    error: view.error,
    retry: view.retry,
    selected: view.selected,
    select,
    close,
});

interface ModpacksInput {
    readonly uuid: string;
    readonly uploadSizeMb: number;
    readonly active: boolean;
    readonly providers: readonly ContentProvider[];
    readonly linked: PreselectedItem | null;
    readonly types: readonly SoftwareTypeInfo[];
}

export function useModpacksModel({
    uuid,
    uploadSizeMb,
    active,
    providers,
    linked,
    types,
}: ModpacksInput): ModpacksModel {
    const [provider, setProvider] = useState<ContentProvider>('modrinth');
    const [queryText, setQueryText] = useState('');
    const [sort, setSort] = useState<ContentSort>('relevance');
    const [target, setTarget] = useState<Target | null>(null);
    const [chosen, setChosen] = useState<string | null>(null);
    const [fresh, setFresh] = useState(true);
    const [importFresh, setImportFresh] = useState(true);
    const query = useDebounced(queryText.trim(), DEBOUNCE_MS);
    const search = useModpackSearch(uuid, { provider, query, sort }, active);
    const versionsQuery = useModpackVersions(uuid, target?.provider ?? provider, target?.projectId ?? null);
    const view = versionsView(versionsQuery, chosen, target?.versionId ?? null);
    const previewQuery = useModpackPreview(
        uuid,
        target?.provider ?? provider,
        target?.projectId ?? null,
        view.selected
    );
    const install = useInstallModpack(uuid);
    const importModpack = useImportModpack(uuid);
    const importer = useImporter({
        uuid,
        uploadSizeMb,
        extensions: ['.mrpack', '.zip'],
        start: (path) => importModpack.mutateAsync({ path, wipe: { enabled: importFresh, keep_worlds: true } }),
    });
    const open = (next: Target) => {
        setChosen(null);
        setTarget(next);
    };

    useLinkedTarget(linked, 'modpack', (next) => {
        setProvider(next.provider);
        open(next);
    });

    const installSelected = async (snapshot: Target, versionId: string) => {
        setTarget(null);
        await attempt(() =>
            install.mutateAsync({
                provider: snapshot.provider,
                projectId: snapshot.projectId,
                versionId,
                wipe: { enabled: fresh, keep_worlds: true },
            })
        );
    };

    return {
        ...browseOf({
            noun: 'modpacks',
            providers,
            search,
            provider,
            setProvider,
            query,
            queryText,
            setQueryText,
            sort,
            setSort,
            open: (item) => open(targetOf(item)),
            missingKey: !providers.includes(provider),
        }),
        drawer: target
            ? {
                  ...drawerBase(target, 'Modpack', view, setChosen, () => setTarget(null)),
                  preview: previewModel(view.selected, previewQuery, types),
                  fresh,
                  setFresh,
                  install: async () => {
                      if (view.selected !== null) {
                          await installSelected(target, view.selected);
                      }
                  },
              }
            : null,
        importer: { ...importer, fresh: importFresh, setFresh: setImportFresh },
    };
}

interface WorldsInput {
    readonly uuid: string;
    readonly uploadSizeMb: number;
    readonly active: boolean;
    /** CurseForge has no key on this panel. */
    readonly missingKey: boolean;
    readonly linked: PreselectedItem | null;
}

const worldOptions = (
    mode: WorldMode,
    backup: boolean,
    setMode: (mode: WorldMode) => void,
    setBackup: (backup: boolean) => void
): WorldOptionsModel => {
    const keepsCopy = mode === 'replace' && backup;

    return {
        mode,
        setMode,
        backup,
        setBackup,
        summary: worldSummary(mode, keepsCopy),
        destructive: mode === 'replace' && !backup,
        levelHint,
    };
};

export function useWorldsModel({ uuid, uploadSizeMb, active, missingKey, linked }: WorldsInput): WorldsModel {
    const [queryText, setQueryText] = useState('');
    const [sort, setSort] = useState<ContentSort>('relevance');
    const [target, setTarget] = useState<Target | null>(null);
    const [chosen, setChosen] = useState<string | null>(null);
    const [mode, setMode] = useState<WorldMode>('replace');
    const [backup, setBackup] = useState(true);
    const query = useDebounced(queryText.trim(), DEBOUNCE_MS);
    const search = useWorldSearch(uuid, { provider: 'curseforge', query, sort }, active && !missingKey);
    const versionsQuery = useWorldVersions(uuid, target?.projectId ?? null);
    const view = versionsView(versionsQuery, chosen, target?.versionId ?? null);
    const installWorld = useInstallWorld(uuid);
    const importWorld = useImportWorld(uuid);
    const options = worldOptions(mode, backup, setMode, setBackup);
    const keepsCopy = mode === 'replace' && backup;
    const importer = useImporter({
        uuid,
        uploadSizeMb,
        extensions: ['.zip'],
        start: (path) => importWorld.mutateAsync({ path, mode, backup: keepsCopy }),
    });
    const open = (next: Target) => {
        setChosen(null);
        setTarget(next);
    };

    useLinkedTarget(linked, 'world', open);

    const installSelected = async (snapshot: Target, fileId: string) => {
        setTarget(null);
        await attempt(() =>
            installWorld.mutateAsync({ projectId: snapshot.projectId, fileId, mode, backup: keepsCopy })
        );
    };

    return {
        ...browseOf({
            noun: 'worlds',
            providers: ['curseforge'],
            search,
            provider: 'curseforge',
            setProvider: noop,
            query,
            queryText,
            setQueryText,
            sort,
            setSort,
            open: (item) => open(targetOf(item)),
            missingKey,
        }),
        options,
        drawer: target
            ? {
                  ...drawerBase(target, 'World', view, setChosen, () => setTarget(null)),
                  install: async () => {
                      if (view.selected !== null) {
                          await installSelected(target, view.selected);
                      }
                  },
              }
            : null,
        importer,
    };
}
