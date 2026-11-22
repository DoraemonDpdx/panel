import { AuthResetPasswordPage } from '@/sdk';
import type { ViewProps } from '@/sdk/theme';

export default function ResetPasswordPage({ model, className }: ViewProps<'page.auth.passwordReset'>) {
    return <AuthResetPasswordPage model={model} className={className} />;
}
