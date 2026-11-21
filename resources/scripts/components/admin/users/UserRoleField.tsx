/*
 * ============================================================
 *  Coded by DPDX
 * ============================================================
 *  This file is proprietary to DPDX. Customers receiving a
 *  DPDX-built product may run it as delivered only; they hold
 *  no ownership of it, and no other party has any right to use it.
 */

import { useAdminRoles } from '@/api/admin/roles/queries';
import type { UserValues } from '@/api/admin/users/types';
import type { AppForm } from '@/components/form';

const NO_ROLE = 'none';

/**
 * Picker for a user's admin role. Listing roles is root-only, so for a role holder the
 * request fails and the field is not rendered at all.
 */
export default function UserRoleField({ form }: { form: AppForm<UserValues> }) {
    const { data: roles, isError } = useAdminRoles();

    if (isError || !roles) {
        return null;
    }

    return (
        <form.AppField name='roleId'>
            {(field) => (
                <field.SelectField
                    id='role_id'
                    label='Role'
                    options={[
                        { value: NO_ROLE, label: 'No role' },
                        ...roles.map((role) => ({ value: String(role.attributes.id), label: role.attributes.name })),
                    ]}
                    onChange={(value) => field.handleChange(value === NO_ROLE ? '' : String(value))}
                    description='Limits this account to the administrator permissions of a role. Ignored for full administrators.'
                />
            )}
        </form.AppField>
    );
}

// -- Coded by DPDX. Property of DPDX; run-as-delivered use only. --
