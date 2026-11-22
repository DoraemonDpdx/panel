import type { ExtensionFormValues } from '@/extensions/forms';

export interface UserValues {
    email: string;
    username: string;
    nameFirst: string;
    nameLast: string;
    password: string;
    rootAdmin: boolean;
    /** Admin role id as a string; empty means no role. */
    roleId: string;
    language: string;
    extensions: ExtensionFormValues;
}
