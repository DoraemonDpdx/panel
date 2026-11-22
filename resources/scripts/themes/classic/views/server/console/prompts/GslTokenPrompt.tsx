import { KeyRound } from 'lucide-react';
import { Form, useAppForm } from '@/sdk';
import type { ViewProps } from '@/sdk/theme';
import PromptCard, { PromptActions } from './PromptCard';

export default function GslTokenPrompt({ model, className }: ViewProps<'server.feature.gslToken'>) {
    const form = useAppForm({
        defaultValues: { gslToken: '' },
        onSubmit: async ({ value }) => {
            // The failure has already been reported.
            await model.submit(value.gslToken).catch(() => {});
        },
    });

    return (
        <PromptCard
            className={className}
            open={model.open}
            title='Invalid GSL token'
            icon={KeyRound}
            pending={model.pending}
            onClose={model.close}
        >
            <Form form={form}>
                <p>
                    The Gameserver Login Token is invalid or has expired. Enter a new one, or leave the field blank to
                    remove it.
                </p>
                <div className='mt-3'>
                    <form.AppField name='gslToken'>
                        {(field) => (
                            <field.TextField
                                label='GSL Token'
                                description='Visit https://steamcommunity.com/dev/managegameservers to generate a token.'
                            />
                        )}
                    </form.AppField>
                </div>
                <div className='mt-3'>
                    <PromptActions>
                        <form.AppForm>
                            <form.SubmitButton>Update GSL token</form.SubmitButton>
                        </form.AppForm>
                    </PromptActions>
                </div>
            </Form>
        </PromptCard>
    );
}
