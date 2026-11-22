import { useState } from 'react';
import {
    softwareError,
    useConvertSoftware,
    useInstallSoftware,
    useSoftwareCatalog,
    type ModsAction,
    type SoftwareCatalog,
    type SoftwareState,
    type SoftwareTypeInfo,
} from '@/api/server/software/queries';
import { attempt } from './attempt';
import {
    buildLabel,
    buildOptions,
    changesFamily,
    familyNoun,
    installBody,
    installSummary,
    minecraftOptions,
    MODS_ACTIONS,
    resolveChoice,
    type CatalogChoice,
    typeCards,
    typeLabel,
} from './softwareItems';
import type { ConfigureModel, FamilyChange, SoftwareTypeModel } from './softwareTypes';

interface Picks {
    readonly snapshots: boolean;
    readonly fresh: boolean;
    readonly keepWorlds: boolean;
    readonly action: ModsAction;
}

interface Setters {
    readonly setMinecraft: (version: string) => void;
    readonly setBuild: (build: string) => void;
    readonly setSnapshots: (show: boolean) => void;
    readonly setFresh: (fresh: boolean) => void;
    readonly setKeepWorlds: (keep: boolean) => void;
    readonly setAction: (action: ModsAction) => void;
    readonly close: () => void;
}

interface ConfigureInput {
    readonly info: SoftwareTypeInfo;
    readonly types: readonly SoftwareTypeInfo[];
    readonly choice: CatalogChoice;
    readonly catalog: ReturnType<typeof useSoftwareCatalog>;
    readonly builds: ReturnType<typeof useSoftwareCatalog>;
    readonly picks: Picks;
    readonly setters: Setters;
    readonly changed: boolean;
    readonly currentNoun: string;
    readonly needsConvert: boolean;
    readonly install: ReturnType<typeof useInstallSoftware>;
}

type CatalogQuery = ReturnType<typeof useSoftwareCatalog>;

const perVersionBuilds = (type: string | null): boolean => type === 'paper' || type === 'purpur' || type === 'folia';

const mergeCatalog = (versions: SoftwareCatalog | undefined, builds: SoftwareCatalog | undefined) =>
    versions && { minecraft: versions.minecraft, loaders: { ...versions.loaders, ...builds?.loaders } };

const catalogView = (catalog: CatalogQuery, builds: CatalogQuery) => {
    const failed = catalog.error ?? builds.error;

    return {
        catalogLoading: (catalog.isPending && !catalog.error) || (builds.isLoading && !builds.error),
        catalogError: failed ? softwareError(failed).message : null,
        retryCatalog: () => void (catalog.error ? catalog.refetch() : builds.refetch()),
    };
};

/** What happens to the old mods or plugins: nothing is kept when the files are wiped. */
const modsActionOf = (changed: boolean, picks: Picks): ModsAction => {
    if (!changed) {
        return 'keep';
    }

    return picks.fresh ? 'remove' : picks.action;
};

const familyOf = ({ changed, currentNoun, picks, setters }: ConfigureInput): FamilyChange | null =>
    changed && !picks.fresh
        ? { noun: currentNoun, action: picks.action, setAction: setters.setAction, options: MODS_ACTIONS }
        : null;

const configureOf = (input: ConfigureInput): ConfigureModel => {
    const { info, types, choice, picks, setters, changed, currentNoun, needsConvert, install } = input;
    const label = typeLabel(info.type, types);
    const modsAction = modsActionOf(changed, picks);
    const catalog = catalogView(input.catalog, input.builds);

    return {
        type: info.type,
        label,
        icon: info.icon,
        minecraftOptions: minecraftOptions(input.catalog.data?.minecraft ?? []),
        minecraft: choice.minecraft,
        setMinecraft: setters.setMinecraft,
        showSnapshots: picks.snapshots,
        setShowSnapshots: setters.setSnapshots,
        buildLabel: buildLabel(info.type),
        buildOptions: buildOptions(choice.builds),
        build: choice.build,
        setBuild: setters.setBuild,
        ...catalog,
        fresh: picks.fresh,
        setFresh: setters.setFresh,
        keepWorlds: picks.keepWorlds,
        setKeepWorlds: setters.setKeepWorlds,
        family: familyOf(input),
        summary: installSummary({
            label,
            minecraft: choice.minecraft,
            build: info.type === 'vanilla' ? null : choice.build,
            fresh: picks.fresh,
            keepWorlds: picks.keepWorlds,
            family: changed ? { noun: currentNoun, action: modsAction } : null,
        }),
        destructive: picks.fresh && !picks.keepWorlds,
        ready:
            choice.minecraft !== null &&
            (info.type === 'vanilla' || choice.build !== null) &&
            !catalog.catalogLoading &&
            !needsConvert,
        installing: install.isPending,
        install: async () => {
            if (choice.minecraft === null) {
                return;
            }

            const body = installBody({
                type: info.type,
                minecraft: choice.minecraft,
                build: choice.build,
                fresh: picks.fresh,
                keepWorlds: picks.keepWorlds,
                modsAction,
            });

            if (await attempt(() => install.mutateAsync(body))) {
                setters.close();
            }
        },
        close: setters.close,
    };
};

interface TypeInput {
    readonly uuid: string;
    readonly state: SoftwareState | undefined;
    readonly canManage: boolean;
    readonly busy: boolean;
}

/** The type cards and the panel that configures the chosen one. */
export function useTypeModel({ uuid, state, canManage, busy }: TypeInput): SoftwareTypeModel {
    const [selected, setSelected] = useState<string | null>(null);
    const [snapshots, setSnapshots] = useState(false);
    const [minecraftPick, setMinecraftPick] = useState<string | null>(null);
    const [buildPick, setBuildPick] = useState<string | null>(null);
    const [fresh, setFresh] = useState(false);
    const [keepWorlds, setKeepWorlds] = useState(true);
    const [action, setAction] = useState<ModsAction>('disable');
    const catalog = useSoftwareCatalog(uuid, selected, snapshots);
    const versionPick = resolveChoice(catalog.data, minecraftPick, buildPick).minecraft;
    // Paper, Purpur and Folia list their builds only for one Minecraft version.
    const builds = useSoftwareCatalog(uuid, perVersionBuilds(selected) ? selected : null, snapshots, versionPick);
    const install = useInstallSoftware(uuid);
    const convert = useConvertSoftware(uuid);
    const types = state?.types ?? [];
    const info = types.find((candidate) => candidate.type === selected);
    const currentKind = types.find((candidate) => candidate.type === state?.current.type)?.kind;
    const needsConvert = state !== undefined && !state.current.egg_managed;
    const open = canManage && !busy;

    const reset = () => {
        setMinecraftPick(null);
        setBuildPick(null);
        setSnapshots(false);
        setFresh(false);
        setKeepWorlds(true);
        setAction('disable');
    };

    const close = () => {
        setSelected(null);
        reset();
    };

    const setters: Setters = {
        setMinecraft: (version) => {
            setMinecraftPick(version);
            setBuildPick(null);
        },
        setBuild: setBuildPick,
        setSnapshots,
        setFresh,
        setKeepWorlds,
        setAction,
        close,
    };

    return {
        cards: typeCards(types, state?.current.type ?? null),
        selected: open ? selected : null,
        select: (type) => {
            reset();
            setSelected(type);
        },
        needsConvert,
        convert: {
            pending: convert.isPending,
            run: async () => {
                await attempt(() => convert.mutateAsync());
            },
        },
        configure:
            open && info
                ? configureOf({
                      info,
                      types,
                      choice: resolveChoice(mergeCatalog(catalog.data, builds.data), minecraftPick, buildPick),
                      catalog,
                      builds,
                      picks: { snapshots, fresh, keepWorlds, action },
                      setters,
                      changed: changesFamily(info.kind, currentKind),
                      currentNoun: familyNoun(currentKind),
                      needsConvert,
                      install,
                  })
                : null,
    };
}
