import { HardDrive } from 'lucide-react';
import type { ViewProps } from '@/sdk/theme';
import PromptCard from './PromptCard';

export default function SteamDiskSpacePrompt({ model, className }: ViewProps<'server.feature.steamDiskSpace'>) {
    return (
        <PromptCard
            className={className}
            open={model.open}
            title='Out of available disk space'
            icon={HardDrive}
            onClose={model.close}
        >
            {model.admin ? (
                <>
                    <p>
                        The machine hosting this server has run out of disk space, so the install or update cannot
                        finish.
                    </p>
                    <p>
                        Run <code className='font-mono bg-muted rounded-sm py-1 px-2'>df -h</code> on that machine, then
                        free space or add more.
                    </p>
                </>
            ) : (
                <p>
                    The install or update cannot finish because the machine is out of disk space. Please tell an
                    administrator.
                </p>
            )}
        </PromptCard>
    );
}
