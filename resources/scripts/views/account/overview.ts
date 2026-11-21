import { useState } from 'react';
import { useField, useForm, useStore } from '@tanstack/react-form';
import { useLocation } from '@tanstack/react-router';
import {
    useCurrentUser,
    useDeleteAccountAvatar,
    useUpdateAccountAvatar,
    useUpdateAccountEmail,
    useUpdateAccountPassword,
} from '@/api/account/queries';
import {
    useAccountTwoFactorToken,
    useDisableAccountTwoFactor,
    useEnableAccountTwoFactor,
} from '@/api/account/two-factor/queries';
import {
    useBeginPasskeyRegistration,
    usePasskeys,
    useRegisterPasskey,
    useRemovePasskey,
} from '@/api/account/passkeys/queries';
import { httpErrorToHuman } from '@/api/http';
import { imageUploadAccept } from '@/lib/images';
import { useObjectUrl } from '@/plugins/useObjectUrl';
import { useSiteSettings } from '@/api/settings/queries';
import {
    createPasskey,
    PASSKEY_FAILED,
    passkeyBody,
    passkeyErrorMessage,
    type PasskeyCreationOptions,
} from '@/lib/webauthn';
import { boundField, fixtureField, stateField, type FieldAttributes } from '../forms';
import { implementViews } from '../registry';
import type {
    AccountEmailModel,
    AccountAvatarModel,
    AccountOverviewModel,
    AccountPasskeysModel,
    AccountPasswordModel,
    AccountTwoFactorModel,
    TwoFactorDialog,
} from './types';

const isEmail = (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
const currentPassword = { type: 'password', autoComplete: 'current-password' } as const;
const newPassword = { type: 'password', autoComplete: 'new-password' } as const;
const totpCode: FieldAttributes = {
    type: 'text',
    inputMode: 'numeric',
    autoComplete: 'one-time-code',
    pattern: '[0-9]{6}',
};

function useAccountOverviewModel(): AccountOverviewModel {
    const state = useLocation().state;
    const { userAvatarsEnabled } = useSiteSettings();

    return {
        twoFactorRequired: 'twoFactorRedirect' in state && state.twoFactorRedirect === true,
        userAvatarsEnabled,
    };
}

function useAccountPasswordModel(): AccountPasswordModel {
    const updatePassword = useUpdateAccountPassword();
    const form = useForm({
        defaultValues: { current: '', password: '', confirmPassword: '' },
        onSubmit: async ({ value }) => {
            try {
                await updatePassword.mutateAsync({
                    body: {
                        current_password: value.current,
                        password: value.password,
                        password_confirmation: value.confirmPassword,
                    },
                });
            } catch {
                // Error toast is handled by the mutation.
            }
        },
    });
    const current = useField({
        form,
        name: 'current',
        validators: {
            onChange: ({ value }) => (value.length >= 1 ? undefined : 'You must provide your current password.'),
        },
    });
    const password = useField({
        form,
        name: 'password',
        validators: {
            onChange: ({ value }) =>
                value.length >= 8 ? undefined : 'Your new password should be at least 8 characters in length.',
        },
    });
    const confirmPassword = useField({
        form,
        name: 'confirmPassword',
        validators: {
            onChangeListenTo: ['password'],
            onChange: ({ value, fieldApi }) =>
                value === fieldApi.form.getFieldValue('password')
                    ? undefined
                    : 'Password confirmation does not match the password you entered.',
        },
    });
    const canSubmit = useStore(form.store, (state) => state.canSubmit);
    const submitting = useStore(form.store, (state) => state.isSubmitting);

    return {
        fields: {
            current: boundField(current, currentPassword),
            password: boundField(password, newPassword),
            confirmPassword: boundField(confirmPassword, newPassword),
        },
        submit: () => void form.handleSubmit(),
        canSubmit: canSubmit && !updatePassword.isPending,
        submitting: submitting || updatePassword.isPending,
    };
}

function useAccountEmailModel(): AccountEmailModel {
    const user = useCurrentUser();
    const updateEmail = useUpdateAccountEmail();
    const form = useForm({
        defaultValues: { email: user.email, password: '' },
        onSubmit: async ({ value, formApi }) => {
            try {
                await updateEmail.mutateAsync({ body: value });
                formApi.setFieldValue('password', '');
            } catch {
                // Error toast is handled by the mutation.
            } finally {
                formApi.setFieldMeta('password', (meta) => ({ ...meta, errors: [] }));
            }
        },
    });
    const email = useField({
        form,
        name: 'email',
        validators: {
            onChange: ({ value }) => (isEmail(value) ? undefined : 'A valid email address must be provided.'),
        },
    });
    const password = useField({
        form,
        name: 'password',
        validators: {
            onChange: ({ value }) =>
                value.length >= 1 ? undefined : 'You must provide your current account password.',
        },
    });
    const canSubmit = useStore(form.store, (state) => state.canSubmit);
    const submitting = useStore(form.store, (state) => state.isSubmitting);

    return {
        fields: {
            email: boundField(email, { type: 'email', autoComplete: 'email' }),
            password: boundField(password, currentPassword),
        },
        submit: () => void form.handleSubmit(),
        canSubmit: canSubmit && !updateEmail.isPending,
        submitting: submitting || updateEmail.isPending,
    };
}

/** A URL for the file while it is set, revoked when it changes. */
function useAccountAvatarModel(): AccountAvatarModel {
    const user = useCurrentUser();
    const update = useUpdateAccountAvatar();
    const remove = useDeleteAccountAvatar();
    const [selected, setSelected] = useState<File | null>(null);
    const avatar = user.avatar ?? null;
    const picked = useObjectUrl(selected);

    return {
        uuid: user.uuid,
        avatar,
        selected,
        preview: selected ? picked : avatar,
        accept: imageUploadAccept,
        select: setSelected,
        submit: () => {
            if (selected === null) {
                return;
            }

            update.mutate({ body: { avatar: selected } }, { onSuccess: () => setSelected(null) });
        },
        remove: () => remove.mutate({}),
        canSubmit: selected !== null && !update.isPending,
        submitting: update.isPending || remove.isPending,
    };
}

function useAccountTwoFactorModel(): AccountTwoFactorModel {
    const enabled = useCurrentUser().useTotp;
    const [dialog, setDialog] = useState<TwoFactorDialog | null>(null);
    const [recoveryTokens, setRecoveryTokens] = useState<readonly string[]>([]);
    const [code, setCode] = useState('');
    const [setupPassword, setSetupPassword] = useState('');
    const [disablePassword, setDisablePassword] = useState('');
    const secret = useAccountTwoFactorToken(dialog === 'enable');
    const enable = useEnableAccountTwoFactor();
    const disable = useDisableAccountTwoFactor();
    const token = secret.data?.data;
    const failed = secret.error && !secret.isFetching ? httpErrorToHuman(secret.error) : null;

    const submitSetup = async () => {
        if (enable.isPending) {
            return;
        }

        try {
            const response = await enable.mutateAsync({ body: { code, password: setupPassword } });

            setRecoveryTokens(response.attributes.tokens);
            setDialog(null);
        } catch {
            // Error toast is handled by the mutation.
        }
    };

    const submitDisable = async () => {
        if (disable.isPending) {
            return;
        }

        try {
            await disable.mutateAsync({ body: { password: disablePassword } });
            setDialog(null);
        } catch {
            // Error toast is handled by the mutation.
        }
    };

    return {
        enabled,
        dialog,
        // Each dialog opens empty, as it did when its form mounted with it.
        openDialog: (next) => {
            setCode('');
            setSetupPassword('');
            setDisablePassword('');
            setDialog(next);
        },
        closeDialog: () => setDialog(null),
        setup: {
            fields: {
                code: stateField('code', code, setCode, totpCode),
                password: stateField('password', setupPassword, setSetupPassword, currentPassword),
            },
            submit: () => void submitSetup(),
            canSubmit: !!token && code.length === 6 && setupPassword.length > 0 && !enable.isPending,
            submitting: enable.isPending,
            secret: token?.secret ?? null,
            qrCode: token?.image_url_data ?? null,
            error: failed,
            retry: () => void secret.refetch(),
        },
        disable: {
            fields: { password: stateField('password', disablePassword, setDisablePassword, currentPassword) },
            submit: () => void submitDisable(),
            canSubmit: disablePassword.length > 0 && !disable.isPending,
            submitting: disable.isPending,
        },
        recoveryTokens,
        dismissRecoveryTokens: () => setRecoveryTokens([]),
    };
}

const DEVICES: readonly (readonly [RegExp, string])[] = [
    [/iPhone/, 'iPhone'],
    [/iPad/, 'iPad'],
    [/Android/, 'Android phone'],
    [/Macintosh|Mac OS X/, 'Mac'],
    [/Windows/, 'Windows PC'],
    [/CrOS/, 'Chromebook'],
    [/Linux/, 'Linux PC'],
];

/** A name for the device in hand that no existing passkey already uses. */
function deviceName(taken: readonly string[]): string {
    const base = DEVICES.find(([pattern]) => pattern.test(navigator.userAgent))?.[1] ?? 'My passkey';
    const used = new Set(taken.map((name) => name.toLowerCase()));

    for (let n = 1; ; n++) {
        const candidate = n === 1 ? base : `${base} ${n}`;

        if (!used.has(candidate.toLowerCase())) {
            return candidate;
        }
    }
}

function useAccountPasskeysModel(): AccountPasskeysModel {
    const list = usePasskeys();
    const begin = useBeginPasskeyRegistration();
    const register = useRegisterPasskey();
    const removePasskey = useRemovePasskey();
    const [adding, setAdding] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const passkeys = (list.data?.data ?? []).map((passkey) => ({
        id: passkey.id ?? 0,
        name: passkey.name ?? 'Passkey',
        createdAt: passkey.created_at ?? '',
        lastUsedAt: passkey.last_used_at ?? null,
    }));

    return {
        passkeys,
        loading: list.isLoading,
        adding,
        removing: removePasskey.isPending,
        error,
        suggestName: () => deviceName(passkeys.map((passkey) => passkey.name)),
        add: async (name) => {
            setAdding(true);
            setError(null);

            try {
                const begun = await begin.mutateAsync({});
                const attestation = await createPasskey(begun.data?.options as PasskeyCreationOptions);

                await register.mutateAsync({ body: { name, response: passkeyBody(attestation) } });

                return true;
            } catch (e) {
                setError(e instanceof Error ? passkeyErrorMessage(e) : PASSKEY_FAILED);

                return false;
            } finally {
                setAdding(false);
            }
        },
        remove: async (id, password) => {
            try {
                await removePasskey.mutateAsync({ path: { id }, body: { password } });

                return true;
            } catch {
                // Error toast is handled by the mutation.
                return false;
            }
        },
    };
}

const noop = () => {};

const passwordFixture = (error: string | null = null): AccountPasswordModel => ({
    fields: {
        current: fixtureField('current', currentPassword),
        password: fixtureField('password', newPassword, error ? 'short' : '', error),
        confirmPassword: fixtureField('confirmPassword', newPassword),
    },
    submit: noop,
    canSubmit: error === null,
    submitting: false,
});

const emailFixture = (submitting = false): AccountEmailModel => ({
    fields: {
        email: fixtureField('email', { type: 'email', autoComplete: 'email' }, 'alex@example.test'),
        password: fixtureField('password', currentPassword, submitting ? 'correct horse' : ''),
    },
    submit: noop,
    canSubmit: !submitting,
    submitting,
});

const picture = '/favicons/android-chrome-192x192.png';

function avatarFixture(avatar: string | null, selected: File | null = null): AccountAvatarModel {
    return {
        uuid: '11111111-1111-4111-8111-111111111111',
        avatar,
        selected,
        preview: selected ? picture : avatar,
        accept: imageUploadAccept,
        select: noop,
        submit: noop,
        remove: noop,
        canSubmit: selected !== null,
        submitting: false,
    };
}

const SECRET = 'JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP';

function twoFactorFixture(overrides: Partial<AccountTwoFactorModel> = {}): AccountTwoFactorModel {
    return {
        enabled: false,
        dialog: null,
        openDialog: noop,
        closeDialog: noop,
        setup: {
            fields: { code: fixtureField('code', totpCode), password: fixtureField('password', currentPassword) },
            submit: noop,
            canSubmit: false,
            submitting: false,
            secret: SECRET,
            qrCode: `otpauth://totp/Astrelyse:alex%40example.test?secret=${SECRET}&issuer=Astrelyse`,
            error: null,
            retry: noop,
        },
        disable: {
            fields: { password: fixtureField('password', currentPassword) },
            submit: noop,
            canSubmit: false,
            submitting: false,
        },
        recoveryTokens: [],
        dismissRecoveryTokens: noop,
        ...overrides,
    };
}

const passkeysFixture = (overrides: Partial<AccountPasskeysModel> = {}): AccountPasskeysModel => ({
    passkeys: [],
    loading: false,
    adding: false,
    removing: false,
    error: null,
    add: () => Promise.resolve(true),
    remove: () => Promise.resolve(true),
    suggestName: () => 'Mac',
    ...overrides,
});

implementViews({
    'page.account.overview': {
        use: useAccountOverviewModel,
        fixtures: {
            default: () => ({ twoFactorRequired: false, userAvatarsEnabled: false }),
            twoFactorRequired: () => ({ twoFactorRequired: true, userAvatarsEnabled: false }),
            avatars: () => ({ twoFactorRequired: false, userAvatarsEnabled: true }),
        },
    },
    'account.password': {
        use: useAccountPasswordModel,
        fixtures: {
            default: () => passwordFixture(),
            invalid: () => passwordFixture('Your new password should be at least 8 characters in length.'),
        },
    },
    'account.email': {
        use: useAccountEmailModel,
        fixtures: { default: () => emailFixture(), submitting: () => emailFixture(true) },
    },
    'account.avatar': {
        use: useAccountAvatarModel,
        fixtures: {
            default: () => avatarFixture(null),
            uploaded: () => avatarFixture(picture),
            picked: () => avatarFixture(null, new File(['avatar'], 'avatar.png', { type: 'image/png' })),
        },
    },
    'account.passkeys': {
        use: useAccountPasskeysModel,
        fixtures: {
            empty: () => passkeysFixture(),
            loading: () => passkeysFixture({ loading: true }),
            list: () =>
                passkeysFixture({
                    passkeys: [
                        {
                            id: 1,
                            name: 'MacBook',
                            createdAt: '2026-11-01T10:00:00+00:00',
                            lastUsedAt: '2026-11-17T08:30:00+00:00',
                        },
                        { id: 2, name: 'YubiKey', createdAt: '2026-11-10T10:00:00+00:00', lastUsedAt: null },
                    ],
                }),
            failed: () => passkeysFixture({ error: 'The passkey prompt was cancelled or timed out. Try again.' }),
        },
    },
    'account.twoFactor': {
        use: useAccountTwoFactorModel,
        fixtures: {
            disabled: () => twoFactorFixture(),
            enabled: () => twoFactorFixture({ enabled: true }),
            setup: () => twoFactorFixture({ dialog: 'enable' }),
            setupLoading: () => {
                const model = twoFactorFixture({ dialog: 'enable' });

                return { ...model, setup: { ...model.setup, secret: null, qrCode: null } };
            },
            disabling: () => twoFactorFixture({ enabled: true, dialog: 'disable' }),
            recoveryTokens: () =>
                twoFactorFixture({
                    enabled: true,
                    recoveryTokens: [
                        'a1b2c3d4e5',
                        'f6g7h8i9j0',
                        'k1l2m3n4o5',
                        'p6q7r8s9t0',
                        'u1v2w3x4y5',
                        'z6a7b8c9d0',
                    ],
                }),
        },
    },
});
