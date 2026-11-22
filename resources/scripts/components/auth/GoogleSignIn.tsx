import { useEffect, useRef } from 'react';
import type { GoogleSignInModel } from '@/views/auth/types';

interface GoogleCredentialResponse {
    credential?: string;
}

interface GoogleInitializeOptions {
    client_id: string;
    ux_mode: 'popup';
    callback: (response: GoogleCredentialResponse) => void;
}

interface GoogleButtonOptions {
    type: 'standard';
    theme: 'filled_black';
    size: 'large';
    text: 'continue_with';
    width: number;
}

interface GoogleIdentity {
    accounts: {
        id: {
            initialize: (options: GoogleInitializeOptions) => void;
            renderButton: (element: HTMLElement, options: GoogleButtonOptions) => void;
        };
    };
}

declare global {
    interface Window {
        google?: GoogleIdentity;
    }
}

const SCRIPT_SRC = 'https://accounts.google.com/gsi/client';

const loadScript = (): Promise<void> =>
    new Promise((resolve, reject) => {
        if (window.google?.accounts) {
            resolve();

            return;
        }

        const existing = document.querySelector<HTMLScriptElement>(`script[src="${SCRIPT_SRC}"]`);
        const script = existing ?? document.createElement('script');

        script.addEventListener('load', () => resolve(), { once: true });
        script.addEventListener('error', () => reject(new Error('Google sign-in failed to load.')), { once: true });

        if (!existing) {
            script.src = SCRIPT_SRC;
            script.async = true;
            document.head.append(script);
        }
    });

/** Google's four-colour "G". */
function GoogleMark() {
    return (
        <svg width='18' height='18' viewBox='0 0 48 48' aria-hidden='true'>
            <path
                className='as-gmark-red'
                d='M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.8 2.4 30.3 0 24 0 14.6 0 6.5 5.4 2.6 13.2l7.9 6.2C12.4 13.6 17.7 9.5 24 9.5z'
            />
            <path
                className='as-gmark-blue'
                d='M46.5 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.7c-.6 3-2.3 5.5-4.8 7.2l7.5 5.8c4.4-4.1 7.1-10.1 7.1-17.5z'
            />
            <path
                className='as-gmark-yellow'
                d='M10.5 28.6a14.5 14.5 0 0 1 0-9.2l-7.9-6.2a24 24 0 0 0 0 21.6l7.9-6.2z'
            />
            <path
                className='as-gmark-green'
                d='M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.5-5.8c-2.1 1.4-4.8 2.3-8.4 2.3-6.3 0-11.6-4.1-13.5-9.9l-7.9 6.2C6.5 42.6 14.6 48 24 48z'
            />
        </svg>
    );
}

/** "Continue with Google", rendered by Google Identity Services; the ID token is verified by the panel. */
export default function GoogleSignIn({ model }: { model: GoogleSignInModel }) {
    const box = useRef<HTMLDivElement>(null);
    const onCredential = useRef(model.onCredential);

    onCredential.current = model.onCredential;

    useEffect(() => {
        let cancelled = false;

        void loadScript()
            .then(() => {
                const { google } = window;

                if (cancelled || !google || !box.current) {
                    return;
                }

                google.accounts.id.initialize({
                    client_id: model.clientId,
                    ux_mode: 'popup',
                    callback: (response) => {
                        if (response.credential) {
                            onCredential.current(response.credential);
                        }
                    },
                });
                google.accounts.id.renderButton(box.current, {
                    type: 'standard',
                    theme: 'filled_black',
                    size: 'large',
                    text: 'continue_with',
                    width: Math.min(400, box.current.clientWidth || 400),
                });
            })
            .catch(() => {
                // Google is unreachable; password sign-in still works.
            });

        return () => {
            cancelled = true;
        };
    }, [model.clientId]);

    return (
        <div className='as-auth-google-wrap' aria-busy={model.busy}>
            <div className='as-btn as-ui-btn as-auth-google' aria-hidden='true'>
                <GoogleMark />
                Continue with Google
            </div>
            <div ref={box} className='as-auth-google-real' />
        </div>
    );
}
