import { TriangleAlert } from 'lucide-react';
import type { ViewProps } from '@/sdk/theme';
import PromptCard from './PromptCard';

export default function PidLimitPrompt({ model, className }: ViewProps<'server.feature.pidLimit'>) {
    return (
        <PromptCard
            className={className}
            open={model.open}
            title={model.admin ? 'Memory or process limit reached' : 'Possible resource limit reached'}
            icon={TriangleAlert}
            onClose={model.close}
        >
            {model.admin ? (
                <>
                    <p>This server hit the maximum process or memory limit.</p>
                    <p>
                        Raising <code className='font-mono bg-muted'>container_pid_limit</code> in the wings{' '}
                        <code className='font-mono bg-muted'>config.yml</code> may fix it. Restart Wings for the change
                        to apply.
                    </p>
                </>
            ) : (
                <>
                    <p>
                        This server is trying to use more resources than it has. Tell an administrator and give them
                        this error:
                    </p>
                    <p>
                        <code className='font-mono bg-muted'>
                            pthread_create failed, Possibly out of memory or process/resource limits reached
                        </code>
                    </p>
                </>
            )}
        </PromptCard>
    );
}
