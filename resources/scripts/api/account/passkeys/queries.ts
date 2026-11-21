import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

import {
    clientBeginPasskeyRegistrationMutation,
    clientListPasskeysOptions,
    clientListPasskeysQueryKey,
    clientRegisterAPasskeyMutation,
    clientRemoveAPasskeyMutation,
} from '@/api/generated/@tanstack/react-query.gen';
import { notifyHttpError } from '@/plugins/notifications';

export const usePasskeys = () => useQuery(clientListPasskeysOptions());

export const useBeginPasskeyRegistration = () =>
    useMutation({
        ...clientBeginPasskeyRegistrationMutation(),
        onError: (error) => notifyHttpError(error, 'Unable to start passkey setup'),
    });

export const useRegisterPasskey = () => {
    const queryClient = useQueryClient();

    return useMutation({
        ...clientRegisterAPasskeyMutation(),
        onSuccess: async () => {
            await queryClient.invalidateQueries({ queryKey: clientListPasskeysQueryKey() });
            toast.success('Passkey added');
        },
        onError: (error) => notifyHttpError(error, 'Unable to add that passkey'),
    });
};

export const useRemovePasskey = () => {
    const queryClient = useQueryClient();

    return useMutation({
        ...clientRemoveAPasskeyMutation(),
        onSuccess: async () => {
            await queryClient.invalidateQueries({ queryKey: clientListPasskeysQueryKey() });
            toast.success('Passkey removed');
        },
        onError: (error) => notifyHttpError(error, 'Unable to remove that passkey'),
    });
};
