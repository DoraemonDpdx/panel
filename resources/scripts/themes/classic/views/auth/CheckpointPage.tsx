import { AuthCheckpointPage } from '@/sdk';
import type { ViewProps } from '@/sdk/theme';

export default function CheckpointPage({ model, className }: ViewProps<'page.auth.checkpoint'>) {
    return <AuthCheckpointPage model={model} className={className} />;
}
