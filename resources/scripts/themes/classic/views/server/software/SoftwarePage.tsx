import { ServerContentBlock } from '@/sdk';
import { View, type ViewProps } from '@/sdk/theme';
import PageStatus from '../../shared/PageStatus';

export default function SoftwarePage({ model, className }: ViewProps<'page.server.software'>) {
    return (
        <PageStatus model={model} className={className}>
            <ServerContentBlock title={model.title} className={className}>
                <View name='server.software' />
            </ServerContentBlock>
        </PageStatus>
    );
}
