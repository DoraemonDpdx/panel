import type { DiscordSignInModel } from '@/views/auth/types';
import DiscordIcon from './DiscordIcon';

/** "Continue with Discord": a plain link, the panel verifies the account on the way back. */
export default function DiscordSignIn({ model }: { model: DiscordSignInModel }) {
    return (
        <a href={model.href} className='as-btn as-ui-btn as-auth-discord'>
            <DiscordIcon />
            Continue with Discord
        </a>
    );
}
