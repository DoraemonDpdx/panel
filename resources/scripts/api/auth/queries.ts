import { useMutation } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
    authBeginPasskeyLoginStepMutation,
    authCompleteLoginCheckpointMutation,
    authCompletePasskeyLoginStepMutation,
    authLoginMutation,
    authContinueADiscordSignInMutation,
    authLoginWithGoogleMutation,
    authLogoutMutation,
    authRequestPasswordResetEmailMutation,
    authResetPasswordMutation,
} from '@/api/generated/@tanstack/react-query.gen';
import { authGetCsrfCookie } from '@/api/generated/sdk.gen';
import { notifyHttpError } from '@/plugins/notifications';

export const useLogin = () =>
    useMutation({
        ...authLoginMutation(),
        onMutate: async () => {
            await authGetCsrfCookie();
        },
        onError: (error) => notifyHttpError(error, 'Unable to log in'),
    });

export const useGoogleLogin = () =>
    useMutation({
        ...authLoginWithGoogleMutation(),
        onMutate: async () => {
            await authGetCsrfCookie();
        },
        onError: (error) => notifyHttpError(error, 'Unable to sign in with Google'),
    });

/** Creates a panel account for the Discord identity the person confirmed on the sign-in screen. */
export const useDiscordRegister = () =>
    useMutation({
        ...authContinueADiscordSignInMutation(),
        onMutate: async () => {
            await authGetCsrfCookie();
        },
    });

export const usePasskeyLoginOptions = () =>
    useMutation({
        ...authBeginPasskeyLoginStepMutation(),
        onError: (error) => notifyHttpError(error, 'Unable to start the passkey check'),
    });

export const usePasskeyLoginVerify = () =>
    useMutation({
        ...authCompletePasskeyLoginStepMutation(),
        onError: (error) => notifyHttpError(error, 'That passkey did not work'),
    });

export const useLoginCheckpoint = () =>
    useMutation({
        ...authCompleteLoginCheckpointMutation(),
        onError: (error) => notifyHttpError(error, 'Unable to verify two-step code'),
    });

export const useRequestPasswordResetEmail = () =>
    useMutation({
        ...authRequestPasswordResetEmailMutation(),
        onSuccess: (response) => toast.success(response.status || 'Password reset email sent'),
        onError: (error) => notifyHttpError(error, 'Unable to request password reset'),
    });

export const usePerformPasswordReset = () =>
    useMutation({
        ...authResetPasswordMutation(),
        onError: (error) => notifyHttpError(error, 'Unable to reset password'),
    });

export const useLogout = () =>
    useMutation({
        ...authLogoutMutation(),
        onSettled: () => {
            window.location.assign('/');
        },
    });
