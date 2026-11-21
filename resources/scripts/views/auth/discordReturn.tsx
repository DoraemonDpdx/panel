import { useEffect } from 'react';
import { useDiscordRegister } from '@/api/auth/queries';
import { httpErrorToHuman } from '@/api/http';
import { useSiteSettings } from '@/api/settings/queries';
import { openDiscordScreen, type DiscordScreenAction } from '@/components/auth/DiscordScreen';

interface DiscordProgress {
    readonly complete?: boolean | undefined;
    readonly confirmation_token?: string | null;
    readonly step?: string | null;
    readonly intended?: string;
    readonly join_url?: string | null;
}

type OpenCheckpoint = (token: string, step: 'totp' | 'passkey') => unknown;

const stepOf = (step: string | null | undefined): 'totp' | 'passkey' => (step === 'passkey' ? 'passkey' : 'totp');

const showError = (title: string, message: string) =>
    openDiscordScreen({
        tone: 'error',
        title,
        body: message,
        actions: [{ label: 'Back to sign in', tone: 'ghost', onSelect: () => true }],
    });

interface OfferOptions {
    readonly newEmail: string | null;
    readonly offerJoin: boolean;
    readonly siteName: string;
    readonly answer: (join: boolean) => Promise<boolean>;
}

/** The question the person answers after Discord: create an account, join the server, or both. */
function openOffer({ newEmail, offerJoin, siteName, answer }: OfferOptions) {
    const question = `Want to join the ${siteName} Discord server? Discord will ask you for one more permission so we can add you.`;
    const account = newEmail ? `We'll create a new account for ${newEmail} using your Discord login.` : null;
    const actions: DiscordScreenAction[] = [];

    if (offerJoin) {
        actions.push(
            { label: newEmail ? 'Create account & join server' : 'Join the server', onSelect: () => answer(true) },
            { label: newEmail ? 'Create account only' : 'No thanks', tone: 'ghost', onSelect: () => answer(false) }
        );
    } else {
        actions.push({ label: 'Create my account', onSelect: () => answer(false) });
    }

    openDiscordScreen({
        title: newEmail ? "You're creating a new account" : 'Join our Discord server?',
        body: (
            <>
                {account && <p>{account}</p>}
                {offerJoin && <p className={account ? 'mt-3' : ''}>{question}</p>}
            </>
        ),
        actions,
    });
}

/**
 * The Discord callback sends the browser back to the sign-in screen with its outcome in the URL fragment:
 * an error, a second-factor token, or a question to ask (create an account, join our Discord server).
 * Every message is shown on the full-screen Discord notice.
 */
export function useDiscordReturn(redirect: string | undefined, openCheckpoint: OpenCheckpoint) {
    const register = useDiscordRegister();
    const siteName = useSiteSettings()?.name ?? 'our';

    useEffect(() => {
        const params = new URLSearchParams(window.location.hash.slice(1));
        const error = params.get('error');
        const token = params.get('discord_token');
        const newEmail = params.get('discord_new');
        const offerJoin = params.get('discord_join') === '1';

        if (!error && !token && !newEmail && !offerJoin) {
            return;
        }

        window.history.replaceState(null, '', window.location.pathname + window.location.search);

        if (error) {
            showError('Discord sign-in failed', error);

            return;
        }

        if (token) {
            if (params.get('discord_join_failed')) {
                showError(
                    'We could not add you to the server',
                    'Your sign-in worked, but Discord would not let us add you to the server. Ask staff for an invite.'
                );
            }

            void openCheckpoint(token, stepOf(params.get('step')));

            return;
        }

        const answer = async (join: boolean): Promise<boolean> => {
            try {
                const response = await register.mutateAsync({ body: { join } });
                const data: DiscordProgress = response.data ?? { complete: false };

                if (data.join_url) {
                    window.location.assign(data.join_url);

                    return false;
                }

                if (data.complete || !data.confirmation_token) {
                    window.location.assign(redirect || data.intended || '/');

                    return false;
                }

                void openCheckpoint(data.confirmation_token, stepOf(data.step));

                return true;
            } catch (cause) {
                showError('Something went wrong', httpErrorToHuman(cause));

                return true;
            }
        };

        openOffer({ newEmail, offerJoin, siteName, answer });
        // Runs once, for the fragment present when the page loads.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);
}
