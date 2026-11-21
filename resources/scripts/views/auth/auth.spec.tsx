/** @vitest-environment jsdom */
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useImperativeHandle, type Ref } from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import {
    createMemoryHistory,
    createRootRoute,
    createRoute,
    createRouter,
    Outlet,
    RouterProvider,
} from '@tanstack/react-router';
import { toast } from 'sonner';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { queryClient } from '@/api/queryClient';
import { siteSettingsQueryKey } from '@/api/settings/queries';
import { renderView } from '@/sdk/testing';
import { View } from '../View';

const mocks = vi.hoisted(() => ({
    login: vi.fn(),
    checkpoint: vi.fn(),
    requestReset: vi.fn(),
    reset: vi.fn(),
    passkeyOptions: vi.fn(),
    passkeyVerify: vi.fn(),
    assertPasskey: vi.fn(),
    execute: vi.fn<() => Promise<string | null>>(),
}));

vi.mock('@/api/auth/queries', () => ({
    useLogin: () => ({ mutateAsync: mocks.login, isPending: false }),
    useLoginCheckpoint: () => ({ mutateAsync: mocks.checkpoint, isPending: false }),
    useGoogleLogin: () => ({ mutateAsync: vi.fn(), isPending: false }),
    useDiscordRegister: () => ({ mutateAsync: vi.fn(), isPending: false }),
    usePasskeyLoginOptions: () => ({ mutateAsync: mocks.passkeyOptions, isPending: false }),
    usePasskeyLoginVerify: () => ({ mutateAsync: mocks.passkeyVerify, isPending: false }),
    useRequestPasswordResetEmail: () => ({ mutateAsync: mocks.requestReset, isPending: false }),
    usePerformPasswordReset: () => ({ mutateAsync: mocks.reset, isPending: false }),
}));

vi.mock('@/lib/webauthn', () => ({
    assertPasskey: mocks.assertPasskey,
    passkeyErrorMessage: (error: Error) => error.message,
    PASSKEY_FAILED: 'That passkey did not work.',
    passkeyBody: (response: { id: string }) => ({ ...response }),
}));

vi.mock('@/components/elements/InvisibleRecaptcha', () => ({
    default: function InvisibleRecaptcha({ ref }: { ref: Ref<{ execute: () => Promise<string | null> }> }) {
        useImperativeHandle(ref, () => ({ execute: mocks.execute }));

        return <div data-testid='recaptcha' />;
    },
}));

const views = {
    '/auth/login': 'page.auth.login',
    '/auth/login/checkpoint': 'page.auth.checkpoint',
    '/auth/password': 'page.auth.password',
    '/auth/password/reset/$token': 'page.auth.passwordReset',
} as const;

let router: ReturnType<typeof createAuthRouter> | undefined;

function createAuthRouter(path: string) {
    const root = createRootRoute({ component: Outlet });

    return createRouter({
        routeTree: root.addChildren(
            Object.entries(views).map(([route, name]) =>
                createRoute({ getParentRoute: () => root, path: route, component: () => <View name={name} /> })
            )
        ),
        history: createMemoryHistory({ initialEntries: [path] }),
    });
}

async function renderAuth(path: string, recaptcha = false) {
    queryClient.setQueryData(siteSettingsQueryKey, {
        name: 'Panel',
        locale: 'en',
        userAvatarsEnabled: false,
        recaptcha: { enabled: recaptcha, siteKey: recaptcha ? 'site-key' : '' },
    });
    router = createAuthRouter(path);

    await act(async () => {
        render(
            <QueryClientProvider client={queryClient}>
                <RouterProvider router={router!} />
            </QueryClientProvider>
        );
    });
}

beforeEach(() => {
    vi.clearAllMocks();
});

afterEach(() => {
    cleanup();
    queryClient.clear();
    router = undefined;
});

describe('auth views from fixtures', () => {
    it('shows field errors and the disabled state a fixture describes', () => {
        const { container, unmount } = renderView('page.auth.login', { fixture: 'submitting' });

        expect(container.querySelector('input[name="username"]')).toBeDisabled();
        expect(container.querySelector('button[type="submit"]')).toHaveAttribute('aria-busy', 'true');
        unmount();

        const invalid = renderView('page.auth.login', { fixture: 'invalid' });

        expect(invalid.container).toHaveTextContent('A username or email must be provided.');
        expect(invalid.container.querySelector('input[name="password"]')).toHaveAttribute('aria-invalid', 'true');
        invalid.unmount();
    });

    it('mounts the extensions of the login form slot with the route', () => {
        const { container, unmount } = renderView('page.auth.login', {
            slots: { 'auth.login.form.after': ({ data }) => <p>Signing in at {data.pathname}</p> },
        });

        expect(container).toHaveTextContent('Signing in at /auth/login');
        unmount();
    });
});

describe('page.auth.login', () => {
    it('gives password managers the attributes they read', async () => {
        await renderAuth('/auth/login');

        const username = screen.getByLabelText('Username or Email');
        const password = screen.getByLabelText('Password');

        expect(username).toHaveAttribute('name', 'username');
        expect(username).toHaveAttribute('autocomplete', 'username');
        expect(password).toHaveAttribute('type', 'password');
        expect(password).toHaveAttribute('autocomplete', 'current-password');
        expect(screen.getByRole('link', { name: 'Forgot password?' })).toHaveAttribute('href', '/auth/password');
    });

    it('hands a two-factor login to the checkpoint with its token and destination', async () => {
        mocks.login.mockResolvedValue({ data: { complete: false, confirmation_token: 'confirm-token' } });
        await renderAuth('/auth/login?redirect=%2Fpanel%2Fnodes');

        fireEvent.change(screen.getByLabelText('Username or Email'), { target: { value: 'alex' } });
        fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'correct horse' } });
        await act(async () => {
            fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));
        });

        await waitFor(() => expect(router!.state.location.pathname).toBe('/auth/login/checkpoint'));
        expect(mocks.login).toHaveBeenCalledWith({
            body: { user: 'alex', password: 'correct horse', 'g-recaptcha-response': '' },
        });
        expect(router!.state.location.search).toEqual({ redirect: '/panel/nodes' });
        expect(router!.state.location.state).toMatchObject({ token: 'confirm-token' });
    });

    it('validates before submitting', async () => {
        await renderAuth('/auth/login');

        fireEvent.change(screen.getByLabelText('Username or Email'), { target: { value: 'alex' } });
        fireEvent.change(screen.getByLabelText('Username or Email'), { target: { value: '' } });

        expect(await screen.findByText('A username or email must be provided.')).toBeVisible();
        expect(screen.getByRole('button', { name: 'Sign in' })).toBeDisabled();
        expect(mocks.login).not.toHaveBeenCalled();
    });

    it('sends the reCAPTCHA token, and stops when verification fails', async () => {
        const error = vi.spyOn(toast, 'error').mockImplementation(() => '');

        mocks.login.mockReturnValue(new Promise(() => {}));
        await renderAuth('/auth/login', true);

        expect(screen.getByTestId('recaptcha')).toBeInTheDocument();
        fireEvent.change(screen.getByLabelText('Username or Email'), { target: { value: 'alex' } });
        fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'secret' } });

        mocks.execute.mockResolvedValueOnce(null);
        await act(async () => {
            fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));
        });

        expect(error).toHaveBeenCalledWith('Captcha verification failed, please try again.');
        expect(mocks.login).not.toHaveBeenCalled();

        mocks.execute.mockResolvedValueOnce('captcha-token');
        await act(async () => {
            fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));
        });

        expect(mocks.login).toHaveBeenCalledWith({
            body: { user: 'alex', password: 'secret', 'g-recaptcha-response': 'captcha-token' },
        });
    });
});

describe('page.auth.checkpoint', () => {
    it('switches to a recovery code and sends it with the confirmation token', async () => {
        mocks.checkpoint.mockResolvedValue({ data: { complete: false } });
        await renderAuth('/auth/login');
        await act(() => router!.navigate({ to: '/auth/login/checkpoint', state: { token: 'confirm-token' } }));

        const code = screen.getByLabelText('Authenticator code');

        expect(code).toHaveAttribute('autocomplete', 'one-time-code');
        fireEvent.click(screen.getByRole('button', { name: 'Use a recovery code' }));

        const recovery = screen.getByTitle('Recovery code');

        expect(recovery).toHaveAttribute('name', 'recoveryCode');
        fireEvent.change(recovery, { target: { value: 'abcd-efgh' } });
        await act(async () => {
            fireEvent.click(screen.getByRole('button', { name: 'Verify' }));
        });

        expect(mocks.checkpoint).toHaveBeenCalledWith({
            body: { confirmation_token: 'confirm-token', authentication_code: '', recovery_token: 'abcd-efgh' },
        });
    });
});

describe('page.auth.checkpoint passkey step', () => {
    it('shows the passkey prompt and signs in once the device confirms it', async () => {
        mocks.passkeyOptions.mockResolvedValue({ data: { options: { challenge: 'abc' } } });
        mocks.assertPasskey.mockResolvedValue({ id: 'cred' });
        mocks.passkeyVerify.mockResolvedValue({ data: { complete: true, intended: '/' } });
        await renderAuth('/auth/login');
        await act(() =>
            router!.navigate({ to: '/auth/login/checkpoint', state: { token: 'confirm-token', step: 'passkey' } })
        );

        expect(screen.queryByTitle('6-digit code')).not.toBeInTheDocument();
        await act(async () => {
            fireEvent.click(screen.getByRole('button', { name: 'Use passkey' }));
        });

        expect(mocks.passkeyOptions).toHaveBeenCalledWith({ body: { confirmation_token: 'confirm-token' } });
        expect(mocks.passkeyVerify).toHaveBeenCalledWith({
            body: { confirmation_token: 'confirm-token', response: { id: 'cred' } },
        });
    });

    it('reports a cancelled device prompt without calling the server again', async () => {
        mocks.passkeyOptions.mockResolvedValue({ data: { options: { challenge: 'abc' } } });
        mocks.assertPasskey.mockRejectedValue(new Error('The passkey prompt was cancelled or timed out. Try again.'));
        await renderAuth('/auth/login');
        await act(() =>
            router!.navigate({ to: '/auth/login/checkpoint', state: { token: 'confirm-token', step: 'passkey' } })
        );
        await act(async () => {
            fireEvent.click(screen.getByRole('button', { name: 'Use passkey' }));
        });

        expect(await screen.findByText('The passkey prompt was cancelled or timed out. Try again.')).toBeVisible();
        expect(mocks.passkeyVerify).not.toHaveBeenCalled();
    });
});

describe('password reset forms', () => {
    it('requests a reset email and clears the form', async () => {
        mocks.requestReset.mockResolvedValue({});
        await renderAuth('/auth/password');

        const email = screen.getByLabelText('Email');

        expect(email).toHaveAttribute('autocomplete', 'email');
        fireEvent.change(email, { target: { value: 'alex@example.test' } });
        await act(async () => {
            fireEvent.click(screen.getByRole('button', { name: 'Send email' }));
        });

        expect(mocks.requestReset).toHaveBeenCalledWith({
            body: { email: 'alex@example.test', 'g-recaptcha-response': '' },
        });
        expect(email).toHaveValue('');
    });

    it('resets with the token and email from the link once the passwords match', async () => {
        mocks.reset.mockReturnValue(new Promise(() => {}));
        await renderAuth('/auth/password/reset/reset-token?email=alex%40example.test');

        expect(screen.getByLabelText('Email')).toHaveValue('alex@example.test');
        fireEvent.change(screen.getByLabelText('New password'), { target: { value: 'correct horse' } });
        fireEvent.change(screen.getByLabelText('Confirm new password'), { target: { value: 'correct' } });

        expect(await screen.findByText('Your new password does not match.')).toBeVisible();
        expect(screen.getByLabelText('New password')).toHaveAttribute('autocomplete', 'new-password');

        fireEvent.change(screen.getByLabelText('Confirm new password'), { target: { value: 'correct horse' } });
        await act(async () => {
            fireEvent.click(screen.getByRole('button', { name: 'Reset password' }));
        });

        expect(mocks.reset).toHaveBeenCalledWith({
            body: {
                email: 'alex@example.test',
                token: 'reset-token',
                password: 'correct horse',
                password_confirmation: 'correct horse',
                'g-recaptcha-response': '',
            },
        });
    });
});
