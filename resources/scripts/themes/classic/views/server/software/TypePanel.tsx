import { useState } from 'react';
import { Alert, Badge, Button, Card, ListRow, NamedIcon, Skeleton, Switch } from '@/sdk';
import type { ConfigureModel, ServerSoftwareModel, TypeCardItem } from '@/sdk/theme';
import { ConfirmDialog, InlineError, NamedSelect, RadioList } from './shared';

function CardContent({ item }: { item: TypeCardItem }) {
    return (
        <>
            <span className='flex w-full items-center gap-3'>
                <Badge variant='soft' className='size-10 shrink-0 justify-center text-base' aria-hidden>
                    <NamedIcon name={item.icon} />
                </Badge>
                <span className='min-w-0 flex-1 font-medium'>{item.label}</span>
                {item.current && (
                    <Badge size='sm' variant='soft' tone='info'>
                        Current
                    </Badge>
                )}
                <Badge size='sm' variant='soft'>
                    {item.kindLabel}
                </Badge>
            </span>
            <span className='text-sm text-muted-foreground'>{item.description}</span>
        </>
    );
}

const GRID = 'grid gap-2 sm:grid-cols-2 xl:grid-cols-4';

function ConvertNotice({ model }: { model: ServerSoftwareModel }) {
    const { type, canConvert } = model;

    if (!type.needsConvert) {
        return null;
    }

    return (
        <Alert
            type='warning'
            className='mb-4'
            action={
                canConvert && (
                    <Button
                        size='xsmall'
                        isSecondary
                        color='grey'
                        isLoading={type.convert.pending}
                        onClick={() => void type.convert.run()}
                    >
                        Convert
                    </Button>
                )
            }
        >
            This server does not use the Astrelyse Minecraft egg, so its software can&apos;t be changed here yet.
            Converting keeps all your files.
        </Alert>
    );
}

function ConfigureForm({ configure, busy }: { configure: ConfigureModel; busy: boolean }) {
    const [confirming, setConfirming] = useState(false);
    const { family } = configure;

    return (
        <Card title={`Install ${configure.label}`}>
            <div className='flex flex-col gap-4'>
                {configure.catalogError && (
                    <InlineError message={configure.catalogError} retry={configure.retryCatalog} />
                )}
                {configure.catalogLoading && <Skeleton kind='row' />}
                {!configure.catalogLoading && !configure.catalogError && (
                    <div className='flex flex-wrap items-end gap-3'>
                        <NamedSelect
                            label='Minecraft version'
                            visible
                            value={configure.minecraft}
                            options={configure.minecraftOptions.map(({ value, label }) => ({ value, label }))}
                            onChange={(value) => configure.setMinecraft(String(value))}
                        />
                        {configure.buildLabel && (
                            <NamedSelect
                                label={configure.buildLabel}
                                visible
                                value={configure.build}
                                options={configure.buildOptions.map(({ value, label }) => ({ value, label }))}
                                onChange={(value) => configure.setBuild(String(value))}
                            />
                        )}
                        <Switch
                            checked={configure.showSnapshots}
                            onChange={configure.setShowSnapshots}
                            label='Show snapshots'
                        />
                    </div>
                )}
                <div className='flex flex-col gap-3'>
                    <Switch
                        checked={configure.fresh}
                        onChange={configure.setFresh}
                        label='Start fresh'
                        description='Deletes the server files before installing.'
                    />
                    {configure.fresh && (
                        <div className='pl-8'>
                            <Switch
                                checked={configure.keepWorlds}
                                onChange={configure.setKeepWorlds}
                                label='Keep worlds'
                                description='Your worlds, server.properties and player lists stay.'
                            />
                        </div>
                    )}
                </div>
                {family && (
                    <section aria-label={`Your current ${family.noun}`} className='flex flex-col gap-2'>
                        <h3 className='text-sm font-medium'>Your current {family.noun}</h3>
                        <RadioList
                            label={`What to do with your current ${family.noun}`}
                            value={family.action}
                            onChange={(value) => family.setAction(value as typeof family.action)}
                            options={family.options.map((option) => ({
                                value: option.value,
                                content: <span className='font-medium'>{option.label}</span>,
                            }))}
                        />
                    </section>
                )}
                <Alert type={configure.destructive ? 'warning' : 'info'}>{configure.summary}</Alert>
                <div className='flex items-center justify-end gap-2'>
                    <Button.Text onClick={configure.close}>Cancel</Button.Text>
                    <Button disabled={!configure.ready || busy} onClick={() => setConfirming(true)}>
                        Install
                    </Button>
                </div>
            </div>
            {confirming && (
                <ConfirmDialog
                    title={`Install ${configure.label}?`}
                    confirm='Install'
                    danger={configure.destructive}
                    pending={configure.installing}
                    onClose={() => setConfirming(false)}
                    onConfirm={() => void configure.install().finally(() => setConfirming(false))}
                >
                    <p>{configure.summary}</p>
                </ConfirmDialog>
            )}
        </Card>
    );
}

export default function TypePanel({ model }: { model: ServerSoftwareModel }) {
    const { type } = model;
    const interactive = model.canManage && !model.busy && !type.needsConvert;

    return (
        <div className='flex flex-col gap-4'>
            <ConvertNotice model={model} />
            {interactive ? (
                <RadioList
                    label='Server type'
                    className={GRID}
                    value={type.selected}
                    onChange={type.select}
                    options={type.cards.map((item) => ({ value: item.type, content: <CardContent item={item} /> }))}
                />
            ) : (
                <div role='group' aria-label='Server type' className={GRID}>
                    {type.cards.map((item) => (
                        <ListRow key={item.type} className='flex flex-col items-start! gap-2 text-left'>
                            <CardContent item={item} />
                        </ListRow>
                    ))}
                </div>
            )}
            {type.configure && <ConfigureForm configure={type.configure} busy={model.busy} />}
        </div>
    );
}
