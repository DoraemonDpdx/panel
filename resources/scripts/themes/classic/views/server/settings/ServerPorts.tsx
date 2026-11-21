import { useEffect, useRef, useState } from 'react';
import { Alert, Badge, Button, Card, Code, cn, Input, Select, Spinner, Switch } from '@/sdk';
import type { EnvFileSettings, PortRoleRow, ServerPortsModel, ViewProps } from '@/sdk/theme';

const FORMATS = [
    { value: 'dotenv', label: 'dotenv (.env)' },
    { value: 'json', label: 'JSON' },
    { value: 'yaml', label: 'YAML' },
];
const MODES = [
    { value: 'managed', label: 'Managed block' },
    { value: 'separate', label: 'Separate file' },
    { value: 'off', label: 'Off (environment only)' },
];
const POLICIES = [
    { value: 'warn', label: 'Leave it and warn me' },
    { value: 'panel', label: 'Panel wins' },
    { value: 'user', label: 'My value wins' },
];

const STATUS = {
    free: { tone: 'success', label: 'Free' },
    in_use: { tone: 'danger', label: 'In use' },
    conflict: { tone: 'warning', label: 'Conflict' },
    unassigned: { tone: 'neutral', label: 'Not assigned' },
} as const;

// Rows have no id of their own, so each gets one that follows it through edits and keeps focus.
const rowIds = new WeakMap<EnvFileSettings['extra'][number], string>();
let nextRowId = 0;
const rowId = (row: EnvFileSettings['extra'][number]): string => {
    let id = rowIds.get(row);

    if (id === undefined) {
        id = `row-${nextRowId++}`;
        rowIds.set(row, id);
    }

    return id;
};

function Section({ title, children }: { title: string; children: React.ReactNode }) {
    return (
        <section className='mt-6 first:mt-0'>
            <h3 className='mb-3 text-sm font-medium'>{title}</h3>
            {children}
        </section>
    );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
    return (
        <div className='flex flex-col gap-1.5'>
            <span className='text-xs text-muted-foreground'>{label}</span>
            {children}
        </div>
    );
}

function RoleRow({ model, row }: { model: ServerPortsModel; row: PortRoleRow }) {
    const status = STATUS[row.status];
    const disabled = !model.allowed;
    const options = [
        { value: 'auto', label: 'Auto' },
        ...(row.allocationId !== null && !row.auto
            ? [{ value: String(row.allocationId), label: row.address ?? String(row.allocationId) }]
            : []),
        ...model.freeAllocations.map((allocation) => ({ value: String(allocation.id), label: allocation.address })),
    ];

    return (
        <tr className='border-t border-border'>
            <td className='py-2 pr-3'>
                <Code dark>{row.role}</Code>
                {row.required && <span className='ml-2 text-xs text-muted-foreground'>required</span>}
            </td>
            <td className='py-2 pr-3'>{row.address ? <Code dark>{row.address}</Code> : '—'}</td>
            <td className='py-2 pr-3 min-w-40'>
                <Select
                    aria-label={`Allocation for ${row.role}`}
                    value={row.auto ? 'auto' : String(row.allocationId)}
                    options={options}
                    disabled={disabled}
                    onChange={(value) => void model.actions.setRole(row.role, value === 'auto' ? null : Number(value))}
                />
            </td>
            <td className='py-2 pr-3'>
                <Badge tone={status.tone} variant='soft' title={row.reason ?? undefined}>
                    {status.label}
                </Badge>
                {row.reason && <p className='mt-1 text-xs text-muted-foreground'>{row.reason}</p>}
            </td>
            <td className='py-2 text-right'>
                {!disabled && row.role !== 'PORT' && !row.required && (
                    <Button.Text size='xsmall' onClick={() => void model.actions.removeRole(row.role)}>
                        Remove
                    </Button.Text>
                )}
            </td>
        </tr>
    );
}

function AddRole({ model }: { model: ServerPortsModel }) {
    const [role, setRole] = useState('');
    const valid = /^[A-Z][A-Z0-9_]*$/.test(role);

    return (
        <div className='mt-3 flex flex-wrap items-end gap-2'>
            <Field label='New role'>
                <Input
                    aria-label='New port role'
                    placeholder='QUERY_PORT'
                    value={role}
                    onChange={(event) => setRole(event.currentTarget.value.toUpperCase())}
                />
            </Field>
            <Button
                size='small'
                disabled={!valid || !model.canAddRole}
                onClick={async () => {
                    if (await model.actions.addRole(role, null)) {
                        setRole('');
                    }
                }}
            >
                Add role
            </Button>
            {model.canReassign && (
                <Button.Text size='small' onClick={() => void model.actions.reassign()}>
                    Reassign automatically
                </Button.Text>
            )}
            {!model.canAddRole && (
                <p className='w-full text-xs text-muted-foreground'>
                    This server has used {model.allocationCount} of {model.allocationLimit} allocations, so no more
                    ports can be assigned automatically. Ask your host for more allocations to add another role.
                </p>
            )}
        </div>
    );
}

function Extras({
    draft,
    setDraft,
    disabled,
}: {
    draft: EnvFileSettings;
    setDraft: (settings: EnvFileSettings) => void;
    disabled: boolean;
}) {
    const update = (index: number, change: Partial<EnvFileSettings['extra'][number]>) =>
        setDraft({
            ...draft,
            extra: draft.extra.map((item, i) => {
                if (i !== index) {
                    return item;
                }

                const next = { ...item, ...change };

                rowIds.set(next, rowId(item));

                return next;
            }),
        });

    return (
        <div className='flex flex-col gap-2'>
            {draft.extra.map((variable, index) => (
                <div key={rowId(variable)} className='flex flex-wrap items-center gap-2'>
                    <Input
                        aria-label={`Variable name ${index + 1}`}
                        placeholder='NAME'
                        value={variable.key}
                        disabled={disabled}
                        onChange={(event) => update(index, { key: event.currentTarget.value })}
                    />
                    <Input
                        aria-label={`Variable value ${index + 1}`}
                        type={variable.secret ? 'password' : 'text'}
                        placeholder={variable.secret && variable.value === null ? 'Saved secret (unchanged)' : 'value'}
                        value={variable.value ?? ''}
                        disabled={disabled}
                        onChange={(event) => update(index, { value: event.currentTarget.value })}
                    />
                    <Switch
                        aria-label={`Secret ${index + 1}`}
                        label='Secret'
                        checked={variable.secret}
                        disabled={disabled}
                        onChange={(secret) => update(index, { secret })}
                    />
                    {!disabled && (
                        <Button.Text
                            size='xsmall'
                            onClick={() => setDraft({ ...draft, extra: draft.extra.filter((_, i) => i !== index) })}
                        >
                            Remove
                        </Button.Text>
                    )}
                </div>
            ))}
            {!disabled && (
                <div>
                    <Button.Text
                        size='xsmall'
                        onClick={() =>
                            setDraft({ ...draft, extra: [...draft.extra, { key: '', value: '', secret: false }] })
                        }
                    >
                        Add variable
                    </Button.Text>
                </div>
            )}
        </div>
    );
}

export default function ServerPorts({ model, className }: ViewProps<'server.ports'>) {
    const [draft, setDraft] = useState<EnvFileSettings>(model.settings);
    const [preview, setPreview] = useState<string | null>(null);
    const [conflicts, setConflicts] = useState<readonly string[]>([]);
    const [saving, setSaving] = useState(false);
    const [restarting, setRestarting] = useState(false);

    // Effects key on values, never on the model's objects, which may be rebuilt on any render.
    const actions = useRef(model.actions);
    actions.current = model.actions;
    const savedKey = JSON.stringify(model.settings);
    const draftKey = JSON.stringify(draft);
    const rolesKey = JSON.stringify(model.roles);

    // A reload of the saved settings replaces whatever was being edited.
    useEffect(() => setDraft(model.settings), [savedKey]);

    useEffect(() => {
        if (model.loading) {
            return;
        }

        let current = true;
        const timer = setTimeout(() => {
            void actions.current.preview(JSON.parse(draftKey) as EnvFileSettings).then((result) => {
                if (current) {
                    setPreview(result?.writes_file ? result.content : null);
                    setConflicts((previous) => {
                        const next = result?.conflicts ?? [];

                        return previous.length === 0 && next.length === 0 ? previous : next;
                    });
                }
            });
        }, 300);

        return () => {
            current = false;
            clearTimeout(timer);
        };
    }, [draftKey, rolesKey, model.loading]);

    if (model.loading) {
        return (
            <div className={className}>
                <Card title='Ports and environment'>
                    <Spinner size='large' centered />
                </Card>
            </div>
        );
    }

    const disabled = !model.allowed;
    const dirty = draftKey !== savedKey;

    return (
        <div className={className}>
            <Card title='Ports and environment' className='relative'>
                {model.restartRequired && (
                    <Alert type='warning' title='Restart required' className='mb-4'>
                        A change to the ports or environment has not reached the running server yet.
                        {model.allowed && model.running && (
                            <div className='mt-2'>
                                <Button
                                    size='xsmall'
                                    isLoading={restarting}
                                    onClick={async () => {
                                        setRestarting(true);
                                        await model.actions.restart();
                                        setRestarting(false);
                                    }}
                                >
                                    Restart to apply
                                </Button>
                            </div>
                        )}
                    </Alert>
                )}
                {disabled && (
                    <p className='mb-4 text-sm text-muted-foreground'>
                        You can see these settings, but changing them needs the settings.ports permission.
                    </p>
                )}

                <Section title='Ports'>
                    <div className='overflow-x-auto'>
                        <table className='w-full text-left text-sm'>
                            <thead className='text-xs text-muted-foreground'>
                                <tr>
                                    <th className='pb-2 pr-3 font-normal'>Role</th>
                                    <th className='pb-2 pr-3 font-normal'>Allocation</th>
                                    <th className='pb-2 pr-3 font-normal'>Mode</th>
                                    <th className='pb-2 pr-3 font-normal'>Status</th>
                                    <th className='pb-2' />
                                </tr>
                            </thead>
                            <tbody>
                                {model.roles.map((row) => (
                                    <RoleRow key={row.role} model={model} row={row} />
                                ))}
                            </tbody>
                        </table>
                    </div>
                    {!disabled && <AddRole model={model} />}
                </Section>

                <Section title='Environment file'>
                    <div className='grid gap-3 sm:grid-cols-2'>
                        <Field label='File name'>
                            <Input
                                aria-label='Environment file name'
                                value={draft.fileName}
                                disabled={disabled}
                                onChange={(event) => setDraft({ ...draft, fileName: event.currentTarget.value })}
                            />
                        </Field>
                        <Field label='Format'>
                            <Select
                                aria-label='Format'
                                value={draft.format}
                                options={FORMATS}
                                disabled={disabled}
                                onChange={(value) => setDraft({ ...draft, format: value as EnvFileSettings['format'] })}
                            />
                        </Field>
                        <Field label='Mode'>
                            <Select
                                aria-label='Mode'
                                value={draft.mode}
                                options={MODES}
                                disabled={disabled}
                                onChange={(value) => setDraft({ ...draft, mode: value as EnvFileSettings['mode'] })}
                            />
                        </Field>
                        <Field label='If my file already sets a variable'>
                            <Select
                                aria-label='Conflict policy'
                                value={draft.conflictPolicy}
                                options={POLICIES}
                                disabled={disabled}
                                onChange={(value) =>
                                    setDraft({ ...draft, conflictPolicy: value as EnvFileSettings['conflictPolicy'] })
                                }
                            />
                        </Field>
                    </div>
                    {conflicts.length > 0 && (
                        <Alert type='warning' title='Your file already defines these variables' className='mt-3'>
                            {conflicts.join(', ')}
                        </Alert>
                    )}
                </Section>

                <Section title='Extra variables'>
                    <Extras draft={draft} setDraft={setDraft} disabled={disabled} />
                </Section>

                <Section title='Preview'>
                    {preview === null ? (
                        <p className='text-sm text-muted-foreground'>
                            {draft.mode === 'off'
                                ? 'No file is written in this mode; the variables are set in the server environment only.'
                                : 'The preview is not available right now.'}
                        </p>
                    ) : (
                        <div className='overflow-hidden rounded-md bg-input'>
                            <div className='flex items-center justify-between gap-3 px-3 pt-2'>
                                <span className='font-mono text-xs text-muted-foreground'>.env</span>
                                <Button.Text size='xsmall' onClick={() => void navigator.clipboard?.writeText(preview)}>
                                    Copy
                                </Button.Text>
                            </div>
                            <pre
                                aria-label='Environment file preview'
                                className={cn('overflow-x-auto whitespace-pre px-3 pb-3 pt-1 font-mono text-xs')}
                            >
                                {preview}
                            </pre>
                        </div>
                    )}
                </Section>

                {!disabled && (
                    <div className='mt-6 flex flex-wrap justify-end gap-2'>
                        <Button.Text size='small' onClick={() => void model.actions.regenerate()}>
                            Regenerate now
                        </Button.Text>
                        {model.running && (
                            <Button.Text
                                size='small'
                                isLoading={restarting}
                                onClick={async () => {
                                    setRestarting(true);
                                    await model.actions.restart();
                                    setRestarting(false);
                                }}
                            >
                                Restart to apply
                            </Button.Text>
                        )}
                        <Button
                            size='small'
                            disabled={!dirty}
                            isLoading={saving}
                            onClick={async () => {
                                setSaving(true);
                                await model.actions.saveSettings(draft);
                                setSaving(false);
                            }}
                        >
                            Save
                        </Button>
                    </div>
                )}
            </Card>
        </div>
    );
}
