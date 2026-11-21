/*
 * ============================================================
 *  Coded by DPDX
 * ============================================================
 *  This file is proprietary to DPDX. Customers receiving a
 *  DPDX-built product may run it as delivered only; they hold
 *  no ownership of it, and no other party has any right to use it.
 */

import { useMemo, useState } from 'react';
import { Dialog as BaseDialog } from '@base-ui/react/dialog';
import { Switch as BaseSwitch } from '@base-ui/react/switch';
import { Search, ShieldCheck, X } from 'lucide-react';
import { type AdminRole, useAdminRolePermissions, useSaveAdminRole } from '@/api/admin/roles/queries';
import Button from '@/components/elements/Button';
import Spinner from '@/components/elements/Spinner';
import { TextInput } from '@/components/form/controls';

import './liquid-glass.css';

interface Props {
    open: boolean;
    onClose: () => void;
    role?: AdminRole;
}

interface GroupInfo {
    title: string;
    noun: string;
    summary: string;
}

const GROUPS = {
    users: { title: 'Users', noun: 'user accounts', summary: 'Panel accounts, their roles and sign-in security.' },
    nodes: { title: 'Nodes', noun: 'nodes', summary: 'The machines that run game servers.' },
    allocations: { title: 'Allocations', noun: 'allocations', summary: 'IP and port pairs assigned to nodes.' },
    locations: { title: 'Locations', noun: 'locations', summary: 'Regions used to group nodes.' },
    mounts: { title: 'Mounts', noun: 'mounts', summary: 'Host directories shared into servers.' },
    tags: { title: 'Tags', noun: 'tags', summary: 'Labels used to organise servers and nodes.' },
    eggs: { title: 'Eggs', noun: 'eggs', summary: 'Server templates, images and startup commands.' },
    'egg-variables': {
        title: 'Egg variables',
        noun: 'egg variables',
        summary: 'Configurable values defined on an egg.',
    },
    servers: { title: 'Servers', noun: 'servers', summary: 'Game servers across every node.' },
    'server-databases': {
        title: 'Server databases',
        noun: 'server databases',
        summary: 'Databases attached to servers.',
    },
    'server-mounts': {
        title: 'Server mounts',
        noun: 'server mounts',
        summary: 'Mounts attached to individual servers.',
    },
    'server-backups': { title: 'Server backups', noun: 'server backups', summary: 'Backups taken for servers.' },
    settings: { title: 'Settings', noun: 'panel settings', summary: 'Global panel configuration.' },
    extensions: { title: 'Extensions', noun: 'extensions', summary: 'Add-ons that extend the panel.' },
    themes: { title: 'Themes', noun: 'themes', summary: 'Panel appearance and skins.' },
    'database-hosts': {
        title: 'Database hosts',
        noun: 'database hosts',
        summary: 'Database servers used for server databases.',
    },
    'api-keys': { title: 'API keys', noun: 'API keys', summary: 'Keys that authenticate against the application API.' },
    version: { title: 'Version', noun: 'version information', summary: 'Installed panel version and updates.' },
    activity: { title: 'Activity', noun: 'activity logs', summary: 'The audit trail of actions in the panel.' },
} satisfies Record<string, GroupInfo>;

const ACTION_VERBS = {
    read: (noun) => `View and list ${noun}.`,
    create: (noun) => `Add new ${noun}.`,
    update: (noun) => `Edit existing ${noun}.`,
    delete: (noun) => `Permanently remove ${noun}.`,
    install: (noun) => `Install new ${noun} on the panel.`,
} satisfies Record<string, (noun: string) => string>;

const groupInfo = (group: string): GroupInfo | undefined => Object.entries(GROUPS).find(([key]) => key === group)?.[1];
const verbFor = (action: string): ((noun: string) => string) | undefined =>
    Object.entries(ACTION_VERBS).find(([key]) => key === action)?.[1];

const titleCase = (value: string): string => value.replaceAll('-', ' ').replace(/^./, (c) => c.toUpperCase());

// admin:servers.read -> { group: 'servers', action: 'read' }; keys without a dot fall under their own name.
const groupPermissions = (permissions: string[]): Map<string, string[]> => {
    const groups = new Map<string, string[]>();

    for (const permission of permissions) {
        const [group = permission] = permission.replace(/^admin:/, '').split('.');

        groups.set(group, [...(groups.get(group) ?? []), permission]);
    }

    return groups;
};

const actionOf = (permission: string): string => permission.split('.').slice(1).join('.') || permission;

const describe = (group: string, permission: string): string => {
    const action = actionOf(permission);
    const noun = groupInfo(group)?.noun ?? group.replaceAll('-', ' ');

    return verbFor(action)?.(noun) ?? `Allow "${action}" on ${noun}.`;
};

const glass = 'lq';

// Liquid switch from the Astrelyse site: frosted pill, glowing green when on, thumb glides across.
function LiquidSwitch({
    checked,
    onChange,
    label,
}: {
    checked: boolean;
    onChange: (checked: boolean) => void;
    label: string;
}) {
    return (
        <BaseSwitch.Root
            checked={checked}
            onCheckedChange={onChange}
            aria-label={label}
            className='lq-switch group relative h-8 w-13 shrink-0 cursor-pointer rounded-full border-0 p-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary'
        >
            <BaseSwitch.Thumb className='lq-thumb absolute left-1 top-1 size-6 rounded-full transition-transform duration-300 ease-[cubic-bezier(0.34,1.56,0.64,1)] group-data-checked:translate-x-5' />
        </BaseSwitch.Root>
    );
}

const filterGroups = (permissions: string[], query: string): Map<string, string[]> => {
    const all = groupPermissions(permissions);
    const q = query.trim().toLowerCase();

    if (!q) {
        return all;
    }

    const filtered = new Map<string, string[]>();

    for (const [group, items] of all) {
        const label = (groupInfo(group)?.title ?? group).toLowerCase();
        const matches = label.includes(q) ? items : items.filter((p) => actionOf(p).includes(q));

        if (matches.length > 0) {
            filtered.set(group, matches);
        }
    }

    return filtered;
};

function GroupCard({
    group,
    permissions,
    selected,
    toggle,
}: {
    group: string;
    permissions: string[];
    selected: Set<string>;
    toggle: (permissions: string[], on: boolean) => void;
}) {
    const info = groupInfo(group);
    const count = permissions.filter((p) => selected.has(p)).length;
    const allOn = count === permissions.length;

    return (
        <div key={group} className={`overflow-hidden rounded-2xl ${glass}`}>
            <div className='flex items-start justify-between gap-4 border-b border-border bg-foreground/5 p-5'>
                <div className='min-w-0'>
                    <p className='text-base font-semibold'>{info?.title ?? titleCase(group)}</p>
                    <p className='mt-0.5 text-sm text-muted-foreground'>{info?.summary ?? 'Related admin actions.'}</p>
                    <p className='mt-2 text-xs font-medium text-muted-foreground'>
                        {count}/{permissions.length} enabled
                    </p>
                </div>
                <LiquidSwitch
                    checked={allOn}
                    label={`Enable all ${info?.title ?? group} permissions`}
                    onChange={(on) => toggle(permissions, on)}
                />
            </div>
            <ul className='divide-y divide-border'>
                {permissions.map((permission) => (
                    <li
                        key={permission}
                        className='flex items-center justify-between gap-4 px-5 py-4 transition hover:bg-foreground/5'
                    >
                        <div className='min-w-0'>
                            <p className='text-sm font-medium'>{titleCase(actionOf(permission))}</p>
                            <p className='text-xs text-muted-foreground'>{describe(group, permission)}</p>
                        </div>
                        <LiquidSwitch
                            checked={selected.has(permission)}
                            label={`${info?.title ?? group}: ${actionOf(permission)}`}
                            onChange={(on) => toggle([permission], on)}
                        />
                    </li>
                ))}
            </ul>
        </div>
    );
}

function FilterInput({ value, onChange }: { value: string; onChange: (value: string) => void }) {
    return (
        <div className={`flex items-center gap-2 rounded-full px-3 py-1.5 ${glass}`}>
            <Search className='size-4 text-muted-foreground' />
            <input
                value={value}
                onChange={(event) => onChange(event.currentTarget.value)}
                placeholder='Filter permissions'
                className='w-40 bg-transparent text-sm outline-none placeholder:text-muted-foreground'
            />
        </div>
    );
}

function PermissionGrid({
    loading,
    groups,
    selected,
    toggle,
}: {
    loading: boolean;
    groups: Map<string, string[]>;
    selected: Set<string>;
    toggle: (permissions: string[], on: boolean) => void;
}) {
    if (loading) {
        return <Spinner size='large' centered />;
    }

    if (groups.size === 0) {
        return <p className='py-8 text-center text-sm text-muted-foreground'>No permissions match your filter.</p>;
    }

    return (
        <div className='grid gap-5 lg:grid-cols-2'>
            {[...groups].map(([group, permissions]) => (
                <GroupCard key={group} group={group} permissions={permissions} selected={selected} toggle={toggle} />
            ))}
        </div>
    );
}

function usePermissionSelection(initial: string[]) {
    const [selected, setSelected] = useState<Set<string>>(new Set(initial));
    const toggle = (permissions: string[], on: boolean) =>
        setSelected((current) => {
            const next = new Set(current);

            for (const permission of permissions) {
                if (on) {
                    next.add(permission);
                } else {
                    next.delete(permission);
                }
            }

            return next;
        });

    return { selected, toggle };
}

export default function RoleFormDialog({ open, onClose, role }: Props) {
    const { data: available, isLoading } = useAdminRolePermissions();
    const save = useSaveAdminRole();
    const [name, setName] = useState(role?.attributes.name ?? '');
    const [description, setDescription] = useState(role?.attributes.description ?? '');
    const { selected, toggle } = usePermissionSelection(role?.attributes.permissions ?? []);
    const [query, setQuery] = useState('');
    const allPermissions = useMemo(() => available?.permissions ?? [], [available]);
    const groups = useMemo(() => filterGroups(allPermissions, query), [allPermissions, query]);
    const everything = selected.size === allPermissions.length;
    const heading = role ? 'Update role' : 'Create role';
    const canSubmit = name.trim().length > 0 && !save.isPending;

    const submit = async () => {
        try {
            await save.mutateAsync({
                id: role?.attributes.id,
                values: {
                    name: name.trim(),
                    description: description.trim() || null,
                    permissions: [...selected],
                },
            });
            onClose();
        } catch {
            // Error toast is handled by the mutation.
        }
    };

    const onOpenChange = (next: boolean) => {
        if (!next && !save.isPending) {
            onClose();
        }
    };

    return (
        <BaseDialog.Root open={open} onOpenChange={onOpenChange}>
            <BaseDialog.Portal>
                <BaseDialog.Backdrop className='fixed inset-0 z-50 bg-background/40 transition-opacity duration-200 data-[ending-style]:opacity-0 data-[starting-style]:opacity-0' />
                <div className='fixed inset-0 z-50 overflow-y-auto'>
                    <div className='flex min-h-full items-center justify-center p-4 sm:p-8'>
                        <BaseDialog.Popup className='relative flex max-h-[90vh] w-full max-w-5xl flex-col overflow-hidden rounded-3xl text-left text-foreground transition-all duration-200 data-[ending-style]:scale-95 data-[starting-style]:scale-95 data-[ending-style]:opacity-0 data-[starting-style]:opacity-0 lq lq-modal'>
                            <form
                                className='m-0 flex min-h-0 flex-1 flex-col'
                                onSubmit={(event) => {
                                    event.preventDefault();
                                    void submit();
                                }}
                            >
                                <header className='flex items-start justify-between gap-4 border-b border-border px-6 py-5 sm:px-8'>
                                    <div className='flex items-center gap-4'>
                                        <div className='grid size-11 place-items-center rounded-2xl border border-border bg-foreground/10 backdrop-blur-md'>
                                            <ShieldCheck className='size-5' />
                                        </div>
                                        <div>
                                            <BaseDialog.Title className='text-xl font-semibold'>
                                                {heading}
                                            </BaseDialog.Title>
                                            <BaseDialog.Description className='text-sm text-muted-foreground'>
                                                Choose exactly what members of this role can do in the admin area.
                                            </BaseDialog.Description>
                                        </div>
                                    </div>
                                    <button
                                        type='button'
                                        aria-label='Close'
                                        disabled={save.isPending}
                                        onClick={onClose}
                                        className='cursor-pointer rounded-full border border-border bg-foreground/10 p-2 transition hover:bg-foreground/20'
                                    >
                                        <X className='size-4' />
                                    </button>
                                </header>

                                <div className='min-h-0 flex-1 space-y-8 overflow-y-auto px-6 py-6 sm:px-8'>
                                    <section className='grid gap-5 sm:grid-cols-2'>
                                        <label className='grid gap-2 text-sm'>
                                            <span className='font-medium'>Name</span>
                                            <TextInput
                                                value={name}
                                                maxLength={191}
                                                autoComplete='off'
                                                placeholder='e.g. Support staff'
                                                onChange={(event) => setName(event.currentTarget.value)}
                                            />
                                        </label>
                                        <label className='grid gap-2 text-sm'>
                                            <span className='font-medium'>Description</span>
                                            <TextInput
                                                value={description}
                                                maxLength={255}
                                                autoComplete='off'
                                                placeholder='What is this role for?'
                                                onChange={(event) => setDescription(event.currentTarget.value)}
                                            />
                                        </label>
                                    </section>

                                    <section className='grid gap-4'>
                                        <div className='flex flex-wrap items-end justify-between gap-3'>
                                            <div>
                                                <h3 className='text-base font-semibold'>Permissions</h3>
                                                <p className='text-sm text-muted-foreground'>
                                                    {selected.size} of {allPermissions.length} actions enabled
                                                </p>
                                            </div>
                                            <div className='flex items-center gap-2'>
                                                <FilterInput value={query} onChange={setQuery} />
                                                <Button.Text
                                                    type='button'
                                                    isSecondary
                                                    onClick={() => toggle(allPermissions, !everything)}
                                                >
                                                    {everything ? 'Clear all' : 'Select all'}
                                                </Button.Text>
                                            </div>
                                        </div>

                                        <PermissionGrid
                                            loading={isLoading}
                                            groups={groups}
                                            selected={selected}
                                            toggle={toggle}
                                        />
                                    </section>
                                </div>

                                <footer className='flex flex-col-reverse gap-2 border-t border-border bg-foreground/5 px-6 py-4 backdrop-blur-xl sm:flex-row sm:justify-end sm:px-8'>
                                    <Button.Text type='button' isSecondary onClick={onClose}>
                                        Cancel
                                    </Button.Text>
                                    <Button type='submit' disabled={!canSubmit}>
                                        {role ? 'Save changes' : 'Create role'}
                                    </Button>
                                </footer>
                            </form>
                        </BaseDialog.Popup>
                    </div>
                </div>
            </BaseDialog.Portal>
        </BaseDialog.Root>
    );
}

// -- Coded by DPDX. Property of DPDX; run-as-delivered use only. --
