import { useState } from 'react';
import { useField, useForm, useStore } from '@tanstack/react-form';
import { useLocation, useSearch } from '@tanstack/react-router';
import {
    useGoogleLogin,
    useLogin,
    useLoginCheckpoint,
    usePasskeyLoginOptions,
    usePasskeyLoginVerify,
} from '@/api/auth/queries';
import { useSiteSettings } from '@/api/settings/queries';
import {
    assertPasskey,
    PASSKEY_FAILED,
    passkeyBody,
    passkeyErrorMessage,
    type PasskeyRequestOptions,
} from '@/lib/webauthn';
import { isString } from '@/lib/objects';
import { parseRedirectSearch } from '@/router/redirect';
import { useRouteSlotData } from '@/router/routeSlots';
import { useOpenLoginCheckpoint } from '@/sdk/navigation';
import { boundField, fixtureField } from '../forms';
import { implementViews } from '../registry';
import { useCaptcha } from './captcha';
import { useDiscordReturn } from './discordReturn';
import type { CheckpointFormModel, DiscordSignInModel, GoogleSignInModel, LoginFormModel } from './types';

/** What every login payload says about the factor it is waiting on, whichever endpoint sent it. */
interface LoginProgress {
    readonly complete?: boolean | undefined;
    readonly confirmation_token?: string | null;
    readonly step?: string | null;
}

const stepOf = (progress: LoginProgress): 'totp' | 'passkey' => (progress.step === 'passkey' ? 'passkey' : 'totp');

const required = (message: string) => ({
    onChange: ({ value }: { value: string }) => (value.length >= 1 ? undefined : message),
});

function useLoginFormModel(): LoginFormModel {
    const { redirect } = parseRedirectSearch(useSearch({ strict: false }));
    const openCheckpoint = useOpenLoginCheckpoint();
    const route = useRouteSlotData();
    const login = useLogin();
    const { Captcha, token } = useCaptcha();
    const form = useForm({
        defaultValues: { username: '', password: '' },
        onSubmit: async ({ value }) => {
            const captcha = await token();

            if (captcha === null) {
                return;
            }

            try {
                const response = await login.mutateAsync({
                    body: { user: value.username, password: value.password, 'g-recaptcha-response': captcha },
                });

                if (response.data.complete) {
                    window.location.assign(redirect || response.data.intended || '/');

                    return;
                }

                const next: LoginProgress = response.data;

                if (next.confirmation_token) {
                    void openCheckpoint(next.confirmation_token, stepOf(next));
                }
            } catch {
                // Error toast is handled by the mutation.
            }
        },
    });
    const googleLogin = useGoogleLogin();
    const googleClientId = useSiteSettings().google?.clientId ?? '';
    const google: GoogleSignInModel | null = googleClientId
        ? {
              clientId: googleClientId,
              busy: googleLogin.isPending,
              onCredential: (credential) => {
                  void googleLogin
                      .mutateAsync({ body: { credential } })
                      .then((response) => {
                          const data: LoginProgress = response.data ?? { complete: false };

                          if (data.complete) {
                              window.location.assign(redirect || '/');

                              return;
                          }

                          if (data.confirmation_token) {
                              void openCheckpoint(data.confirmation_token, stepOf(data));
                          }
                      })
                      .catch(() => {
                          // Error toast is handled by the mutation.
                      });
              },
          }
        : null;
    const discordEnabled = useSiteSettings().discord?.enabled ?? false;
    const discord: DiscordSignInModel | null = discordEnabled ? { href: '/auth/login/discord' } : null;

    useDiscordReturn(redirect, openCheckpoint);
    const username = useField({
        form,
        name: 'username',
        validators: required('A username or email must be provided.'),
    });
    const password = useField({ form, name: 'password', validators: required('Please enter your account password.') });
    const canSubmit = useStore(form.store, (state) => state.canSubmit);
    const submitting = useStore(form.store, (state) => state.isSubmitting) || login.isPending;

    return {
        fields: {
            username: boundField(username, { type: 'text', autoComplete: 'username', disabled: submitting }),
            password: boundField(password, {
                type: 'password',
                autoComplete: 'current-password',
                disabled: submitting,
            }),
        },
        submit: () => void form.handleSubmit(),
        canSubmit,
        submitting,
        Captcha,
        google,
        discord,
        forgotPassword: { to: '/auth/password' },
        route,
    };
}

function useCheckpointFormModel(): CheckpointFormModel {
    // The login form hands over the confirmation token in history state; the route requires it.
    const state = useLocation().state;
    const token = 'token' in state && isString(state.token) ? state.token : '';
    const step = 'step' in state && state.step === 'passkey' ? 'passkey' : 'totp';
    const openCheckpoint = useOpenLoginCheckpoint();
    const { redirect } = parseRedirectSearch(useSearch({ strict: false }));
    const checkpoint = useLoginCheckpoint();
    const [recovery, setRecovery] = useState(false);
    const passkeyOptions = usePasskeyLoginOptions();
    const passkeyVerify = usePasskeyLoginVerify();
    const [passkeyBusy, setPasskeyBusy] = useState(false);
    const [passkeyError, setPasskeyError] = useState<string | null>(null);

    const runPasskey = async () => {
        setPasskeyBusy(true);
        setPasskeyError(null);

        try {
            const begun = await passkeyOptions.mutateAsync({ body: { confirmation_token: token } });
            const assertion = await assertPasskey(begun.data?.options as PasskeyRequestOptions);
            const response = await passkeyVerify.mutateAsync({
                body: { confirmation_token: token, response: passkeyBody(assertion) },
            });

            if (response.data?.complete) {
                window.location.assign(redirect || response.data.intended || '/');
            }
        } catch (error) {
            setPasskeyError(error instanceof Error ? passkeyErrorMessage(error) : PASSKEY_FAILED);
        } finally {
            setPasskeyBusy(false);
        }
    };

    const form = useForm({
        defaultValues: { code: '', recoveryCode: '' },
        onSubmit: async ({ value }) => {
            try {
                const response = await checkpoint.mutateAsync({
                    body: {
                        confirmation_token: token,
                        authentication_code: value.code,
                        recovery_token: value.recoveryCode || undefined,
                    },
                });

                if (response.data.complete) {
                    window.location.assign(redirect || response.data.intended || '/');

                    return;
                }

                // The authenticator code was accepted; the account also holds a passkey.
                const next: LoginProgress = response.data;

                if (next.confirmation_token) {
                    void openCheckpoint(next.confirmation_token, stepOf(next));
                }
            } catch {
                // Error toast is handled by the mutation.
            }
        },
    });
    const code = useField({ form, name: 'code' });
    const recoveryCode = useField({ form, name: 'recoveryCode' });
    const canSubmit = useStore(form.store, (state) => state.canSubmit);
    const submitting = useStore(form.store, (state) => state.isSubmitting);

    return {
        step,
        passkey: { run: () => void runPasskey(), busy: passkeyBusy, error: passkeyError },
        fields: { code: boundField(recovery ? recoveryCode : code, { type: 'text', autoComplete: 'one-time-code' }) },
        submit: () => void form.handleSubmit(),
        canSubmit,
        submitting,
        recovery,
        toggleRecovery: () => {
            form.setFieldValue('code', '');
            form.setFieldValue('recoveryCode', '');
            setRecovery((current) => !current);
        },
        login: { to: '/auth/login', search: { redirect } },
    };
}

const noop = () => {};

const route = { pathname: '/auth/login', search: {}, params: {} };

function loginFixture(
    values: { username: string; password: string } = { username: '', password: '' },
    overrides: Partial<LoginFormModel> = {}
): LoginFormModel {
    const disabled = overrides.submitting ?? false;

    return {
        fields: {
            username: fixtureField('username', { type: 'text', autoComplete: 'username', disabled }, values.username),
            password: fixtureField(
                'password',
                { type: 'password', autoComplete: 'current-password', disabled },
                values.password
            ),
        },
        submit: noop,
        canSubmit: true,
        submitting: false,
        Captcha: null,
        google: null,
        discord: null,
        forgotPassword: { to: '/auth/password' },
        route,
        ...overrides,
    };
}

const checkpointFixture = (recovery: boolean, step: 'totp' | 'passkey' = 'totp'): CheckpointFormModel => ({
    step,
    passkey: { run: noop, busy: false, error: null },
    fields: { code: fixtureField(recovery ? 'recoveryCode' : 'code', { type: 'text', autoComplete: 'one-time-code' }) },
    submit: noop,
    canSubmit: true,
    submitting: false,
    recovery,
    toggleRecovery: noop,
    login: { to: '/auth/login', search: {} },
});

implementViews({
    'page.auth.login': {
        use: useLoginFormModel,
        fixtures: {
            default: () => loginFixture(),
            invalid: () => {
                const model = loginFixture();

                return {
                    ...model,
                    fields: {
                        username: { ...model.fields.username, error: 'A username or email must be provided.' },
                        password: { ...model.fields.password, error: 'Please enter your account password.' },
                    },
                    canSubmit: false,
                };
            },
            submitting: () => loginFixture({ username: 'alex', password: 'correct horse' }, { submitting: true }),
            discord: () => loginFixture(undefined, { discord: { href: '/auth/login/discord' } }),
            google: () =>
                loginFixture(undefined, {
                    google: { clientId: 'example.apps.googleusercontent.com', busy: false, onCredential: noop },
                }),
        },
    },
    'page.auth.checkpoint': {
        use: useCheckpointFormModel,
        fixtures: {
            code: () => checkpointFixture(false),
            recovery: () => checkpointFixture(true),
            passkey: () => checkpointFixture(false, 'passkey'),
        },
    },
});
