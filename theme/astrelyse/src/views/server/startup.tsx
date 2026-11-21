/*
 * ==========================================================================
 *  ____  ____  ____  __  __
 * |  _ \|  _ \|  _ \ \ \/ /
 * | | | | |_) | | | | \  /
 * | |_| |  __/| |_| | /  \
 * |____/|_|   |____/ /_/\_\
 *
 * BUILT BY  DPDX DEVELOPMENT  ·  BENGALURU, INDIA  ·  dpdx.in
 * BUILT FOR ASTRELYSE
 * ==========================================================================
 *
 * PROPRIETARY & CONFIDENTIAL. This file belongs to DPDX. A customer who receives
 * it inside a site, panel theme or bot built and shipped by DPDX may run it as
 * delivered, but does not own it, and no right to copy, modify, resell or reuse
 * it elsewhere is granted without prior written authorisation from DPDX.
 */

import { useCallback, useState } from 'react';
import { Variable } from 'lucide-react';
import {
    Badge,
    Card,
    CopyOnClick,
    Empty,
    EmptyDescription,
    EmptyHeader,
    EmptyMedia,
    EmptyTitle,
    Input,
    InputSpinner,
    Select,
    Switch,
    useDebouncedCallback,
} from '@pterodactyl/sdk';
import type { StartupVariable, StartupVariablesModel, ViewProps } from '@pterodactyl/sdk/theme';

/** Whether any tracked action is still running; rejections are swallowed, the panel having reported them. */
function usePending(): [boolean, (action: Promise<unknown>) => void] {
    const [count, setCount] = useState(0);
    const track = useCallback((action: Promise<unknown>) => {
        setCount((current) => current + 1);
        void action.catch(() => {}).finally(() => setCount((current) => current - 1));
    }, []);

    return [count > 0, track];
}

/** Dense text on a near-solid fill, never clear glass: the command is read, selected and copied. */
export function StartupCommand({ model, className }: ViewProps<'server.startup.command'>) {
    return (
        <Card title='Startup command' className={className}>
            <CopyOnClick text={model.command}>
                <p className='srv-code'>{model.command}</p>
            </CopyOnClick>
        </Card>
    );
}

export function StartupImage({ model, className }: ViewProps<'server.startup.image'>) {
    const choosable = model.images.length > 1 && !model.custom;

    return (
        <Card title='Docker image' className={className}>
            <div className='srv-fields'>
                {choosable ? (
                    <>
                        <InputSpinner visible={model.pending}>
                            <Select
                                value={model.image}
                                onChange={(value) => void model.select(String(value)).catch(() => {})}
                                options={model.images.map(({ label, value }) => ({ value, label }))}
                            />
                        </InputSpinner>
                        <p className='srv-note'>
                            An advanced setting: the Docker image this server runs in.
                        </p>
                    </>
                ) : (
                    <>
                        <Input disabled readOnly value={model.image} aria-label='Docker image' className='font-mono text-sm' />
                        {model.custom && (
                            <p className='srv-note'>
                                An administrator set this image by hand, so it cannot be changed here.
                            </p>
                        )}
                    </>
                )}
            </div>
        </Card>
    );
}

function VariableControl({ model, variable }: { model: StartupVariablesModel; variable: StartupVariable }) {
    const [draft, setDraft] = useState<string | null>(null);
    const [saving, track] = usePending();
    const value = draft ?? variable.value;
    const editable = model.canEdit && variable.editable;
    const { control } = variable;
    // The update of the edit's own model, so an edit flushed after the server changes saves to its server.
    const save = useDebouncedCallback((update: StartupVariablesModel['update'], next: string) => {
        const saved = update(variable.key, next);

        track(saved);
        // A newer draft keeps showing until it has saved too.
        void saved.then(
            () => setDraft((current) => (current === next ? null : current)),
            () => {}
        );
    }, 500);
    const change = (next: string) => {
        setDraft(next);
        save(model.update, next);
    };

    return (
        <InputSpinner visible={saving}>
            {control.kind === 'switch' && (
                <Switch
                    disabled={!editable}
                    checked={value === control.on}
                    onChange={() => editable && change(value === control.on ? control.off : control.on)}
                />
            )}
            {control.kind === 'select' && (
                <Select
                    value={value}
                    onChange={(selected) => change(String(selected))}
                    disabled={!editable}
                    options={control.options.map((option) => ({ value: option, label: option }))}
                />
            )}
            {control.kind === 'text' && (
                <Input
                    onChange={(event) => editable && change(event.currentTarget.value)}
                    onBlur={save.flush}
                    readOnly={!editable}
                    name={variable.key}
                    value={value}
                    placeholder={variable.defaultValue}
                    aria-label={variable.name}
                />
            )}
        </InputSpinner>
    );
}

/** One card, many plain-fill tiles: a long list of variables must not become a long list of backdrop blurs. */
export function StartupVariables({ model, className }: ViewProps<'server.startup.variables'>) {
    return (
        <Card title='Variables' className={className}>
            {model.variables.length === 0 ? (
                <Empty size='compact'>
                    <EmptyHeader>
                        <EmptyMedia variant='icon'>
                            <Variable />
                        </EmptyMedia>
                        <EmptyTitle>No variables</EmptyTitle>
                        <EmptyDescription>This server doesn’t have any startup variables to configure.</EmptyDescription>
                    </EmptyHeader>
                </Empty>
            ) : (
                <div className='srv-variables'>
                    {model.variables.map((variable) => {
                        const labelId = `startup-variable-${variable.key}`;

                        return (
                            <div key={variable.key} className='srv-variable fill'>
                                <p id={labelId} className='srv-variable-name'>
                                    {variable.name}
                                    {!variable.editable && (
                                        <Badge size='sm' tone='neutral'>
                                            Read only
                                        </Badge>
                                    )}
                                </p>
                                <div role='group' aria-labelledby={labelId}>
                                    <VariableControl model={model} variable={variable} />
                                </div>
                                <p className='srv-note'>{variable.description}</p>
                            </div>
                        );
                    })}
                </div>
            )}
        </Card>
    );
}

/* ― Built by DPDX Development · Bengaluru · dpdx.in · for Astrelyse ― */
