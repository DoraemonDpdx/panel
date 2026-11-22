/*
 * ============================================================
 *  Coded by DPDX
 * ============================================================
 *  This file is proprietary to DPDX. Customers receiving a
 *  DPDX-built product may run it as delivered only; they hold
 *  no ownership of it, and no other party has any right to use it.
 */

import { ShieldCheck } from 'lucide-react';
import { httpErrorToHuman } from '@/api/http';
import { type AdminRole, useAdminRolePermissions, useAdminRoles, useDeleteAdminRole } from '@/api/admin/roles/queries';
import AdminContentBlock from '@/components/admin/AdminContentBlock';
import AdminListEmpty from '@/components/admin/AdminListEmpty';
import RoleFormDialog from '@/components/admin/roles/RoleFormDialog';
import { Dialog } from '@/components/elements/dialog';
import { NewButton } from '@/components/elements/NewButton';
import { ServerError } from '@/components/elements/ScreenBlock';
import Spinner from '@/components/elements/Spinner';
import { DeleteAction, EditAction, RowActions } from '@/components/elements/table/RowActions';

const noop = () => {};

const CreateRoleButton = () => (
    <Dialog.Trigger trigger={({ onClick }) => <NewButton onClick={onClick}>New role</NewButton>}>
        {({ open, onClose }) => <RoleFormDialog open={open} onClose={onClose} />}
    </Dialog.Trigger>
);

const RoleRow = ({ role, canManage }: { role: AdminRole; canManage: boolean }) => {
    const deleteRole = useDeleteAdminRole();
    const { name, description, permissions, users_count: usersCount } = role.attributes;

    return (
        <tr className='border-t border-border'>
            <td className='px-4 py-3'>
                <div className='font-medium'>{name}</div>
                {description && <div className='text-xs text-muted-foreground'>{description}</div>}
            </td>
            <td className='px-4 py-3 tabular-nums'>{permissions.length}</td>
            <td className='px-4 py-3 tabular-nums'>{usersCount}</td>
            <td className='px-4 py-3'>
                {canManage && (
                    <RowActions>
                        <Dialog.Trigger
                            trigger={({ onClick }) => <EditAction aria-label={`Edit ${name}`} onClick={onClick} />}
                        >
                            {({ open, onClose }) => <RoleFormDialog role={role} open={open} onClose={onClose} />}
                        </Dialog.Trigger>
                        <Dialog.ConfirmTrigger
                            title='Delete role'
                            confirm='Delete role'
                            onConfirmed={async (_event, close) => {
                                try {
                                    await deleteRole.mutateAsync(role);
                                    close();
                                } catch {
                                    // Error toast is handled by the mutation.
                                }
                            }}
                            trigger={({ onClick }) => <DeleteAction aria-label={`Delete ${name}`} onClick={onClick} />}
                        >
                            <p className='text-sm leading-relaxed text-muted-foreground'>
                                This permanently deletes <strong className='text-foreground'>{name}</strong>.{' '}
                                {usersCount} {usersCount === 1 ? 'user' : 'users'} holding it will lose their
                                administrative access.
                            </p>
                        </Dialog.ConfirmTrigger>
                    </RowActions>
                )}
            </td>
        </tr>
    );
};

export default function RolesContainer() {
    const { data: roles, error, refetch } = useAdminRoles();
    // Only panel owners may change what a role can do; other admins get a read-only view.
    const canManage = useAdminRolePermissions().data?.canManage ?? false;

    if (error) {
        return <ServerError message={httpErrorToHuman(error)} onRetry={() => refetch()} />;
    }

    return (
        <AdminContentBlock
            title='Admin · Roles'
            heading='Roles'
            description='Grant staff a limited set of administrator abilities instead of full root access.'
        >
            {canManage ? (
                <div className='mb-3 flex justify-end'>
                    <CreateRoleButton />
                </div>
            ) : (
                <p className='mb-3 text-sm text-muted-foreground'>
                    Only panel owners can change what each role is allowed to do.
                </p>
            )}
            {roles ? <RoleList roles={roles} canManage={canManage} /> : <Spinner size='large' centered />}
        </AdminContentBlock>
    );
}

function RoleList({ roles, canManage }: { roles: AdminRole[]; canManage: boolean }) {
    if (roles.length === 0) {
        return (
            <AdminListEmpty
                icon={ShieldCheck}
                noun='roles'
                filter=''
                onClearFilter={noop}
                description='Create a role to give staff limited administrative access.'
                action={canManage ? <CreateRoleButton /> : undefined}
            />
        );
    }

    return (
        <div className='overflow-hidden rounded-lg border border-border bg-card'>
            <table className='w-full text-left text-sm'>
                <thead className='text-xs uppercase text-muted-foreground'>
                    <tr>
                        <th className='px-4 py-2'>Role</th>
                        <th className='px-4 py-2'>Permissions</th>
                        <th className='px-4 py-2'>Users</th>
                        <th className='w-24 px-4 py-2' />
                    </tr>
                </thead>
                <tbody>
                    {roles.map((role) => (
                        <RoleRow key={role.attributes.id} role={role} canManage={canManage} />
                    ))}
                </tbody>
            </table>
        </div>
    );
}

// -- Coded by DPDX. Property of DPDX; run-as-delivered use only. --
