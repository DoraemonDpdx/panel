import { AuthLoginPage } from '@/sdk';
import type { ViewProps } from '@/sdk/theme';

export default function LoginPage({ model, className }: ViewProps<'page.auth.login'>) {
    return <AuthLoginPage model={model} className={className} />;
}
