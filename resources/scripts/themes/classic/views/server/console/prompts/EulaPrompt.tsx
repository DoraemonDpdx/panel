import { FileCheck } from 'lucide-react';
import { Button } from '@/sdk';
import type { ViewProps } from '@/sdk/theme';
import PromptCard, { PromptActions } from './PromptCard';

export default function EulaPrompt({ model, className }: ViewProps<'server.feature.eula'>) {
    return (
        <PromptCard
            className={className}
            open={model.open}
            title='Accept the Minecraft® EULA'
            icon={FileCheck}
            pending={model.pending}
            onClose={model.close}
        >
            <p className='text-foreground'>
                The server stopped because the EULA has not been accepted. By pressing &ldquo;I accept&rdquo; you agree
                to the&nbsp;
                <a
                    target='_blank'
                    className='text-accent underline transition-colors duration-150 hover:text-accent/80'
                    rel='noreferrer noopener'
                    href='https://www.minecraft.net/eula'
                >
                    Minecraft® EULA
                </a>
                . This writes <code className='font-mono'>eula=true</code> and restarts the server.
            </p>
            <PromptActions>
                <Button
                    isLoading={model.pending}
                    onClick={() => void model.accept().catch(() => {})}
                    disabled={model.pending}
                >
                    I accept
                </Button>
            </PromptActions>
        </PromptCard>
    );
}
