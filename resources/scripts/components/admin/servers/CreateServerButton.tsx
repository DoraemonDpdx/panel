import { NewLinkButton } from '@/components/elements/NewButton';
import { useHasAdminPermission } from '@/api/account/queries';

export default function CreateServerButton() {
    const canCreate = useHasAdminPermission('admin:servers.create');

    if (!canCreate) {
        return null;
    }

    return <NewLinkButton to='/panel/servers/new'>New server</NewLinkButton>;
}
