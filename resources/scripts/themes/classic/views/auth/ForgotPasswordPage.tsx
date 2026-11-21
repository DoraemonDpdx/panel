import { AuthForgotPasswordPage } from '@/sdk';
import type { ViewProps } from '@/sdk/theme';

export default function ForgotPasswordPage({ model, className }: ViewProps<'page.auth.password'>) {
    return <AuthForgotPasswordPage model={model} className={className} />;
}
