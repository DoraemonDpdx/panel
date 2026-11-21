/*
 * ==========================================================================
 *  ____  ____  ____  __  __
 * |  _ \|  _ \|  _ \ \ \/ /
 * | | | | |_) | | | | \  /
 * | |_| |  __/| |_| | /  \
 * |____/|_|   |____/ /_/\_\
 *
 * BUILT BY  DPDX DEVELOPMENT  ·  BENGALURU, INDIA  ·  dpdx.in
 * BUILT FOR ASTRELYSE
 * ==========================================================================
 *
 * PROPRIETARY & CONFIDENTIAL. This file belongs to DPDX. A customer who receives
 * it inside a site, panel theme or bot built and shipped by DPDX may run it as
 * delivered, but does not own it, and no right to copy, modify, resell or reuse
 * it elsewhere is granted without prior written authorisation from DPDX.
 */

import {
    AuthCheckpointPage,
    AuthForgotPasswordPage,
    AuthLoginPage,
    AuthResetPasswordPage,
} from '@pterodactyl/sdk';
import type { ViewProps } from '@pterodactyl/sdk/theme';

/** The sign-in pages are the website's own, shared by every theme: same backdrop, card, fields and code boxes. */
export const LoginPage = ({ model, className }: ViewProps<'page.auth.login'>) => <AuthLoginPage model={model} className={className} />;
export const ForgotPasswordPage = ({ model, className }: ViewProps<'page.auth.password'>) => (
    <AuthForgotPasswordPage model={model} className={className} />
);
export const ResetPasswordPage = ({ model, className }: ViewProps<'page.auth.passwordReset'>) => (
    <AuthResetPasswordPage model={model} className={className} />
);
export const CheckpointPage = ({ model, className }: ViewProps<'page.auth.checkpoint'>) => <AuthCheckpointPage model={model} className={className} />;

/* ― Built by DPDX Development · Bengaluru · dpdx.in · for Astrelyse ― */
