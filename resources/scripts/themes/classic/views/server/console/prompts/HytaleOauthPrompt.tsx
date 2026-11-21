import { LogIn } from 'lucide-react';
import { Button } from '@/sdk';
import type { ViewProps } from '@/sdk/theme';
import PromptCard, { PromptActions } from './PromptCard';

export default function HytaleOauthPrompt({ model, className }: ViewProps<'server.feature.hytaleOauth'>) {
    return (
        <PromptCard
            className={className}
            open={model.open}
            title='Authentication required'
            icon={LogIn}
            onClose={model.close}
        >
            <p>Log in with your Hytale account to download or update the server files.</p>
            <PromptActions>
                <Button onClick={model.login} disabled={!model.link}>
                    Log in
                </Button>
            </PromptActions>
        </PromptCard>
    );
}
