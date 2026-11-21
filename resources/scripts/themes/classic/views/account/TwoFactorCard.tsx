import { useNavigate } from '@tanstack/react-router';
import { Button, ContentBox } from '@/sdk';
import type { ViewProps } from '@/sdk/theme';
import DisableTwoFactorDialog from './DisableTwoFactorDialog';
import RecoveryTokensDialog from './RecoveryTokensDialog';
import SetupTwoFactorDialog from './SetupTwoFactorDialog';

export default function TwoFactorCard({ model, className }: ViewProps<'account.twoFactor'>) {
    const navigate = useNavigate();

    return (
        <ContentBox className={className} title='Two-Step Verification'>
            <div>
                <SetupTwoFactorDialog model={model} />
                <RecoveryTokensDialog tokens={model.recoveryTokens} onClose={model.dismissRecoveryTokens} />
                <DisableTwoFactorDialog model={model} />
                <p className='text-sm'>
                    {model.enabled
                        ? 'Two-step verification is currently enabled on your account.'
                        : 'You do not currently have two-step verification enabled on your account. Click the button below to begin configuring it.'}
                </p>
                <div className='mt-6'>
                    {model.enabled ? (
                        <Button.Danger onClick={() => model.openDialog('disable')}>Disable Two-Step</Button.Danger>
                    ) : (
                        <Button onClick={() => void navigate({ to: '/account/two-factor' })}>Enable Two-Step</Button>
                    )}
                </div>
            </div>
        </ContentBox>
    );
}
