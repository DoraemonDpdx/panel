import { AuthFrame } from '@/sdk';
import type { ViewProps } from '@/sdk/theme';

export default function AuthLayout({ className, children }: ViewProps<'layout.auth'>) {
    return <AuthFrame className={className}>{children}</AuthFrame>;
}
