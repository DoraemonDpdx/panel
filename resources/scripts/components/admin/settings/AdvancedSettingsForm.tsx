import { useState } from 'react';
import { useAppForm, Form } from '@/components/form';
import type { AdminSettings } from '@/api/admin/settings/queries';
import { updateAdminAdvancedSettingsInput, useUpdateAdminAdvancedSettings } from '@/api/admin/settings/queries';
import { type NumberInputValue, requiredNumber, submittedNumber } from '@/components/admin/numberInput';
import TitledGreyBox from '@/components/elements/TitledGreyBox';
import { Alert } from '@/components/elements/alert';

interface AdvancedSettingsFormValues {
    recaptchaEnabled: boolean;
    recaptchaSecretKey: string;
    recaptchaWebsiteKey: string;
    curseforgeApiKey: string;
    guzzleTimeout: NumberInputValue;
    guzzleConnectTimeout: NumberInputValue;
    allocationsEnabled: boolean;
    allocationsRangeStart: string;
    allocationsRangeEnd: string;
}

const advancedSettingsFormValues = (settings: AdminSettings): AdvancedSettingsFormValues => ({
    recaptchaEnabled: settings.advanced['recaptcha:enabled'],
    recaptchaSecretKey: '',
    recaptchaWebsiteKey: settings.advanced['recaptcha:website_key'],
    curseforgeApiKey: '',
    guzzleTimeout: settings.advanced['pterodactyl:guzzle:timeout'],
    guzzleConnectTimeout: settings.advanced['pterodactyl:guzzle:connect_timeout'],
    allocationsEnabled: settings.advanced['pterodactyl:client_features:allocations:enabled'],
    allocationsRangeStart: String(settings.advanced['pterodactyl:client_features:allocations:range_start'] ?? ''),
    allocationsRangeEnd: String(settings.advanced['pterodactyl:client_features:allocations:range_end'] ?? ''),
});

export default function AdvancedSettingsForm({ settings }: { settings: AdminSettings }) {
    const readOnly = settings.meta.load_environment_only;
    const updateAdvancedSettings = useUpdateAdminAdvancedSettings();
    // "Remove key" is applied on save, by sending "!e" (the same marker the SMTP password uses).
    const [removeCurseforgeKey, setRemoveCurseforgeKey] = useState(false);
    const curseforgeKeySet = settings.meta.curseforge_api_key_set && !removeCurseforgeKey;
    let curseforgeKeyStatus = 'Not set';

    if (removeCurseforgeKey) {
        curseforgeKeyStatus = 'Key will be removed when you save';
    } else if (settings.meta.curseforge_api_key_set) {
        curseforgeKeyStatus = 'Key saved';
    }

    const form = useAppForm({
        defaultValues: advancedSettingsFormValues(settings),
        onSubmit: async ({ value }) => {
            if (readOnly) {
                return;
            }

            try {
                await updateAdvancedSettings.mutateAsync(
                    updateAdminAdvancedSettingsInput({
                        recaptchaEnabled: value.recaptchaEnabled,
                        recaptchaSecretKey: value.recaptchaSecretKey,
                        recaptchaWebsiteKey: value.recaptchaWebsiteKey,
                        curseforgeApiKey: removeCurseforgeKey ? '!e' : value.curseforgeApiKey,
                        guzzleTimeout: submittedNumber(value.guzzleTimeout),
                        guzzleConnectTimeout: submittedNumber(value.guzzleConnectTimeout),
                        allocationsEnabled: value.allocationsEnabled,
                        allocationsRangeStart:
                            value.allocationsRangeStart === '' ? '' : Number(value.allocationsRangeStart),
                        allocationsRangeEnd: value.allocationsRangeEnd === '' ? '' : Number(value.allocationsRangeEnd),
                    })
                );
                setRemoveCurseforgeKey(false);
                form.reset({
                    ...value,
                    recaptchaSecretKey: '',
                    curseforgeApiKey: '',
                });
            } catch {
                // Error toast is handled by the mutation.
            }
        },
    });

    return (
        <Form form={form}>
            <TitledGreyBox title='reCAPTCHA'>
                {settings.meta.show_recaptcha_warning && (
                    <Alert type='warning' className='mb-6 text-sm'>
                        <span>
                            You are using reCAPTCHA keys that shipped with this Panel. Generate new invisible reCAPTCHA
                            keys for this website to improve security.
                        </span>
                    </Alert>
                )}
                <form.AppField name='recaptchaEnabled'>
                    {(field) => (
                        <field.SwitchField
                            label='reCAPTCHA Enabled'
                            description='Protect login and registration forms with reCAPTCHA.'
                            disabled={readOnly}
                        />
                    )}
                </form.AppField>
                <div className='mt-6'>
                    <form.AppField name='recaptchaWebsiteKey'>
                        {(field) => (
                            <field.TextField
                                type='text'
                                id='recaptcha_website_key'
                                label='reCAPTCHA Website Key'
                                disabled={readOnly}
                            />
                        )}
                    </form.AppField>
                </div>
                <div className='mt-6'>
                    <form.AppField name='recaptchaSecretKey'>
                        {(field) => (
                            <field.TextField
                                type='password'
                                id='recaptcha_secret_key'
                                label='reCAPTCHA Secret Key'
                                description='Leave blank to keep the existing secret key.'
                                disabled={readOnly}
                            />
                        )}
                    </form.AppField>
                </div>
            </TitledGreyBox>
            <TitledGreyBox title='CurseForge' className='mt-6'>
                <div className='mb-2 flex items-center justify-between gap-4 text-sm'>
                    <span data-testid='curseforge-key-status' role='status'>
                        {curseforgeKeyStatus}
                    </span>
                    {settings.meta.curseforge_api_key_set && (
                        <button
                            type='button'
                            className='underline disabled:opacity-60'
                            disabled={readOnly}
                            aria-pressed={removeCurseforgeKey}
                            onClick={() => setRemoveCurseforgeKey((removing) => !removing)}
                        >
                            {removeCurseforgeKey ? 'Keep key' : 'Remove key'}
                        </button>
                    )}
                </div>
                <form.AppField name='curseforgeApiKey'>
                    {(field) => (
                        <field.TextField
                            type='password'
                            id='curseforge_api_key'
                            label='CurseForge API key'
                            description={
                                curseforgeKeySet
                                    ? 'From console.curseforge.com. Enables CurseForge in the server Mods tab. Leave blank to keep the saved key.'
                                    : 'From console.curseforge.com. Enables CurseForge in the server Mods tab.'
                            }
                            disabled={readOnly || removeCurseforgeKey}
                            autoComplete='off'
                        />
                    )}
                </form.AppField>
            </TitledGreyBox>
            <TitledGreyBox title='HTTP Connections' className='mt-6'>
                <div className='grid grid-cols-2 gap-4'>
                    <form.AppField
                        name='guzzleTimeout'
                        validators={{
                            onChange: requiredNumber('An HTTP request timeout must be provided.'),
                        }}
                    >
                        {(field) => (
                            <field.NumberField id='guzzle_timeout' label='HTTP Request Timeout' disabled={readOnly} />
                        )}
                    </form.AppField>
                    <form.AppField
                        name='guzzleConnectTimeout'
                        validators={{
                            onChange: requiredNumber('An HTTP connection timeout must be provided.'),
                        }}
                    >
                        {(field) => (
                            <field.NumberField
                                id='guzzle_connect_timeout'
                                label='HTTP Connection Timeout'
                                disabled={readOnly}
                            />
                        )}
                    </form.AppField>
                </div>
            </TitledGreyBox>
            <TitledGreyBox title='Automatic Allocation Creation' className='mt-6'>
                <form.AppField name='allocationsEnabled'>
                    {(field) => (
                        <field.SwitchField
                            label='Auto Create Allocations Enabled'
                            description='Allow users to automatically create new allocations for their server.'
                            disabled={readOnly}
                        />
                    )}
                </form.AppField>
                <div className='mt-6 grid grid-cols-2 gap-4'>
                    <form.AppField name='allocationsRangeStart'>
                        {(field) => (
                            <field.TextField
                                type='number'
                                id='allocations_range_start'
                                label='Starting Port'
                                disabled={readOnly}
                            />
                        )}
                    </form.AppField>
                    <form.AppField name='allocationsRangeEnd'>
                        {(field) => (
                            <field.TextField
                                type='number'
                                id='allocations_range_end'
                                label='Ending Port'
                                disabled={readOnly}
                            />
                        )}
                    </form.AppField>
                </div>
            </TitledGreyBox>
            <div className='flex justify-end mt-6'>
                <form.AppForm>
                    <form.SubmitButton disabled={readOnly}>Save Changes</form.SubmitButton>
                </form.AppForm>
            </div>
        </Form>
    );
}
