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

import { Button, Card, CopyOnClick, Dialog, Form, Input, ip, Label, LinkButton, SpinnerOverlay, useAppForm } from '@pterodactyl/sdk';
import type { ViewProps } from '@pterodactyl/sdk/theme';

/** One labelled value, copyable, in mono: the shape of every identifier on this page. */
function Value({ id, label, value }: { id: string; label: string; value: string }) {
    return (
        <div>
            <Label htmlFor={id}>{label}</Label>
            <CopyOnClick text={value}>
                <Input id={id} type='text' readOnly value={value} className='font-mono text-sm' />
            </CopyOnClick>
        </div>
    );
}

export function ServerSftp({ model, className }: ViewProps<'server.sftp'>) {
    if (!model.allowed) {
        return null;
    }

    const host = `${ip(model.ip)}:${model.port}`;

    return (
        <Card title='SFTP details' className={className}>
            <div className='srv-fields'>
                <Value id='sftp_address' label='Server address' value={`sftp://${host}`} />
                <Value id='sftp_username' label='Username' value={model.username} />
                <p className='srv-note'>Your SFTP password is the same as the password you use to sign in to this panel.</p>
                <div className='srv-actions'>
                    <LinkButton href={`sftp://${model.username}@${host}`} isSecondary>
                        Launch SFTP
                    </LinkButton>
                </div>
            </div>
        </Card>
    );
}

export function ServerDebug({ model, className }: ViewProps<'server.debug'>) {
    return (
        <Card title='Debug information' className={className}>
            <dl className='srv-facts'>
                <div className='srv-fact fill'>
                    <dt>Node</dt>
                    <dd>
                        <code>{model.node}</code>
                    </dd>
                </div>
                <div className='srv-fact fill'>
                    <dt>Server ID</dt>
                    <dd>
                        <CopyOnClick text={model.uuid}>
                            <code className='cursor-pointer'>{model.uuid}</code>
                        </CopyOnClick>
                    </dd>
                </div>
            </dl>
        </Card>
    );
}

export function ServerRename({ model, className }: ViewProps<'server.rename'>) {
    const form = useAppForm({
        defaultValues: { ...model.values },
        onSubmit: ({ value }) => model.save(value),
    });

    if (!model.allowed) {
        return null;
    }

    return (
        <div className={className}>
            <Card title='Server details' className='relative'>
                <form.Subscribe selector={(state) => state.isSubmitting}>
                    {(submitting) => <SpinnerOverlay visible={submitting} />}
                </form.Subscribe>
                <Form form={form} className='m-0'>
                    <div className='srv-fields'>
                        <form.AppField name='name' validators={{ onChange: ({ value }) => model.validateName(value) }}>
                            {(field) => <field.TextField id='name' label='Server name' type='text' />}
                        </form.AppField>
                        <form.AppField name='description'>
                            {(field) => <field.TextAreaField label='Description' rows={3} />}
                        </form.AppField>
                        <div className='srv-actions'>
                            <form.AppForm>
                                <form.SubmitButton>Save</form.SubmitButton>
                            </form.AppForm>
                        </div>
                    </div>
                </Form>
            </Card>
        </div>
    );
}

/** The danger zone: tinted red through the glass token, with a confirmation from the engine's dialog. */
export function ServerReinstall({ model, className }: ViewProps<'server.reinstall'>) {
    if (!model.allowed) {
        return null;
    }

    return (
        <Card title='Reinstall server' className={`srv-danger relative ${className ?? ''}`}>
            <div className='srv-fields'>
                <p className='text-sm text-foreground'>
                    Reinstalling stops the server and runs its installation script again.{' '}
                    <strong className='font-medium'>
                        Some files may be deleted or changed, so back up your data first.
                    </strong>
                </p>
                {model.unavailable && <p className='srv-note'>{model.unavailable}</p>}
                <div className='srv-actions'>
                    <Dialog.ConfirmTrigger
                        title='Confirm server reinstallation'
                        confirm='Yes, reinstall server'
                        onConfirmed={async (_event, close) => {
                            if (await model.reinstall()) {
                                close();
                            }
                        }}
                        trigger={({ onClick }) => (
                            <Button.Danger disabled={model.unavailable !== null} onClick={onClick}>
                                Reinstall server
                            </Button.Danger>
                        )}
                    >
                        Your server will be stopped and some files may be deleted or modified during this process. Are
                        you sure you want to continue?
                    </Dialog.ConfirmTrigger>
                </div>
            </div>
        </Card>
    );
}

/* ― Built by DPDX Development · Bengaluru · dpdx.in · for Astrelyse ― */
