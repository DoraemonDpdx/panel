/*
 * ============================================================
 *  Coded by DPDX
 * ============================================================
 *  This file is proprietary to DPDX. Customers receiving a
 *  DPDX-built product may run it as delivered only; they hold
 *  no ownership of it, and no other party has any right to use it.
 */

/* oxlint-disable eslint/no-restricted-properties, rules/generated-api-mutations --
 * The roles endpoints are not in the generated OpenAPI client yet (it is built from Scribe
 * docs, which need PHP). Replace these calls with the generated client after `npm run api:generate`. */
import { keepPreviousData, queryOptions, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import http from '@/api/http';
import { notifyHttpError } from '@/plugins/notifications';

export interface AdminRole {
    object: 'role';
    attributes: {
        id: number;
        name: string;
        description: string | null;
        permissions: string[];
        users_count: number;
        created_at: string | null;
        updated_at: string | null;
    };
}

export interface AdminRoleList {
    object: 'list';
    data: AdminRole[];
}

export interface AdminRoleValues {
    name: string;
    description: string | null;
    permissions: string[];
}

const roleKeys = {
    all: ['admin', 'roles'] as const,
    permissions: ['admin', 'roles', 'permissions'] as const,
};

// Role management is root-only, so a role holder's 403 here is expected and not retried.
const fetchRoles = async (): Promise<AdminRole[]> =>
    (await http.get<AdminRoleList>('/api/admin/roles', { params: { per_page: 100, sort: 'name' } })).data.data;

export const adminRolesQueryOptions = () =>
    queryOptions({
        queryKey: roleKeys.all,
        queryFn: fetchRoles,
        placeholderData: keepPreviousData,
        retry: false,
    });

export const useAdminRoles = (options: { enabled?: boolean } = {}) =>
    useQuery({ ...adminRolesQueryOptions(), ...options });

export interface AdminRolePermissions {
    permissions: string[];
    /** Whether the current user is a panel owner and may change roles. */
    canManage: boolean;
}

export const adminRolePermissionsQueryOptions = () =>
    queryOptions({
        queryKey: roleKeys.permissions,
        queryFn: async (): Promise<AdminRolePermissions> => {
            const { data } = await http.get<{ data: string[]; meta: { can_manage: boolean } }>(
                '/api/admin/roles/permissions'
            );

            return { permissions: data.data, canManage: data.meta.can_manage };
        },
    });

export const useAdminRolePermissions = () => useQuery(adminRolePermissionsQueryOptions());

export const useSaveAdminRole = () => {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async ({ id, values }: { id?: number; values: AdminRoleValues }): Promise<AdminRole> =>
            id === undefined
                ? (await http.post<AdminRole>('/api/admin/roles', values)).data
                : (await http.put<AdminRole>(`/api/admin/roles/${id}`, values)).data,
        onSuccess: async (role, { id }) => {
            await queryClient.invalidateQueries({ queryKey: roleKeys.all });
            toast.success(id === undefined ? 'Role created' : 'Role updated', {
                description: `${role.attributes.name} has been saved.`,
            });
        },
        onError: (error) => notifyHttpError(error, 'Unable to save role'),
    });
};

export const useDeleteAdminRole = () => {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async (role: AdminRole): Promise<AdminRole> => {
            await http.delete(`/api/admin/roles/${role.attributes.id}`);

            return role;
        },
        onSuccess: async (role) => {
            // Holders of a deleted role are demoted, so user lists change too.
            await queryClient.invalidateQueries({ queryKey: roleKeys.all });
            await queryClient.invalidateQueries({ predicate: (query) => String(query.queryKey[0]).includes('User') });
            toast.success('Role deleted', { description: `${role.attributes.name} has been removed.` });
        },
        onError: (error) => notifyHttpError(error, 'Unable to delete role'),
    });
};

// -- Coded by DPDX. Property of DPDX; run-as-delivered use only. --
