import {
    startAuthentication,
    startRegistration,
    type AuthenticationResponseJSON,
    type RegistrationResponseJSON,
} from '@simplewebauthn/browser';

export type PasskeyCreationOptions = Parameters<typeof startRegistration>[0]['optionsJSON'];
export type PasskeyRequestOptions = Parameters<typeof startAuthentication>[0]['optionsJSON'];

export const PASSKEY_FAILED = 'That passkey did not work.';

/** The browser's reason a passkey prompt failed, in words a person can act on. */
export function passkeyErrorMessage(error: Error): string {
    if (error.name === 'NotAllowedError' || error.name === 'AbortError') {
        return 'The passkey prompt was cancelled or timed out. Try again.';
    }

    if (error.name === 'InvalidStateError') {
        return 'This device already has a passkey for your account.';
    }

    return error.message || PASSKEY_FAILED;
}

export const createPasskey = (options: PasskeyCreationOptions) => startRegistration({ optionsJSON: options });

export const assertPasskey = (options: PasskeyRequestOptions) => startAuthentication({ optionsJSON: options });

/** The attestation or assertion as the plain object the API body takes. */
export const passkeyBody = (response: RegistrationResponseJSON | AuthenticationResponseJSON) => ({ ...response });
