import { useId, useState, type ChangeEvent, type ComponentType, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from '@tanstack/react-router';
import logo from '@/components/auth/astrelyse-logo.svg';
import DiscordSignIn from '@/components/auth/DiscordSignIn';
import GoogleSignIn from '@/components/auth/GoogleSignIn';
import MetallicLogo from '@/components/auth/metallic/MetallicLogo';
import RecaptchaMark from '@/components/auth/metallic/RecaptchaMark';
import OtpInput from '@/components/auth/OtpInput';
import { Dialog, Form, PanelLink, type FieldModel, type ViewProps } from '@/sdk';
import { Slot } from '@/sdk/theme';
import { Main } from '@/views/a11y';
import './auth-site.css';

const MAIN_SITE = import.meta.env.VITE_MAIN_SITE_URL ?? 'https://astrelyse.com';

// Set once the home link has tried the panel home; a second press then offers the main website.
let triedHome = false;

function HomeLink() {
    const navigate = useNavigate();
    const [asking, setAsking] = useState(false);

    return (
        <>
            <button
                type='button'
                className='as-auth-home as-lg as-brand as-btn'
                aria-label='Astrelyse home'
                onClick={() => {
                    if (triedHome) {
                        setAsking(true);

                        return;
                    }

                    triedHome = true;
                    void navigate({ to: '/' });
                }}
            >
                <img src={logo} alt='' width={28} height={28} /> Astrelyse
            </button>
            <Dialog.Confirm
                open={asking}
                title='Go to the main website?'
                confirm='Go to astrelyse.com'
                onClose={() => setAsking(false)}
                onConfirmed={() => window.location.assign(MAIN_SITE)}
            >
                You will leave the panel and open the Astrelyse website.
            </Dialog.Confirm>
        </>
    );
}

/** The website's auth screen: backdrop, metallic mark, home link, and the page centred in `<main>`. */
export function AuthFrame({ children, className }: { children: ReactNode; className?: string }) {
    return (
        <div className={className ? `as-root ${className}` : 'as-root'}>
            <div className='as-auth-bg' aria-hidden='true' />
            <div className='as-auth-mark' aria-hidden='true'>
                <MetallicLogo />
            </div>
            <HomeLink />
            <Main className='as-auth'>{children}</Main>
        </div>
    );
}

/** The website's sign-in card: title, one line saying what this is, the form, then the links. */
export function AuthCard({
    title,
    lede,
    submit,
    footer,
    className,
    children,
}: {
    className?: string;
    title: string;
    lede: string;
    submit?: () => void;
    footer?: ReactNode;
    children: ReactNode;
}) {
    const body = <div className='as-auth-form'>{children}</div>;

    return (
        <section
            className={
                className
                    ? `as-ui-card as-ui-surface as-auth-card ${className}`
                    : 'as-ui-card as-ui-surface as-auth-card'
            }
        >
            <div>
                <h1>{title}</h1>
                <p className='as-auth-lede'>{lede}</p>
            </div>
            {submit ? (
                <Form form={{ handleSubmit: submit }} className='as-auth-form'>
                    {children}
                </Form>
            ) : (
                body
            )}
            {footer && <div className='as-auth-foot'>{footer}</div>}
        </section>
    );
}

export function AuthField({
    field,
    label,
    hint,
    autoFocus,
}: {
    field: FieldModel;
    label: string;
    hint?: string;
    autoFocus?: boolean;
}) {
    const id = useId();

    return (
        <div className='as-ui-field' data-invalid={field.error ? '' : undefined}>
            <label htmlFor={id} className='as-ui-field-label'>
                {label}
            </label>
            <input
                {...field.fieldProps}
                id={id}
                title={label}
                aria-invalid={field.error ? true : undefined}
                autoFocus={autoFocus}
                className='as-ui-input'
                aria-describedby={field.error || hint ? `${id}-msg` : undefined}
            />
            {field.error ? (
                <span id={`${id}-msg`} className='as-ui-field-msg as-ui-field-error' role='alert'>
                    {field.error}
                </span>
            ) : (
                hint && (
                    <span id={`${id}-msg`} className='as-ui-field-msg'>
                        {hint}
                    </span>
                )
            )}
        </div>
    );
}

export function AuthButton({
    loading,
    disabled,
    children,
}: {
    loading?: boolean;
    disabled?: boolean;
    children: ReactNode;
}) {
    return (
        <button
            type='submit'
            className='as-btn as-ui-btn as-btn-primary'
            disabled={disabled || loading}
            aria-busy={loading || undefined}
        >
            {loading && <span className='as-ui-spin' aria-hidden='true' />}
            {children}
        </button>
    );
}

/** The invisible reCAPTCHA plus the notice Google requires when its own badge is hidden, as a glass pill. */
function CaptchaSlot({ Captcha }: { Captcha: ComponentType | null }) {
    if (!Captcha) {
        return null;
    }

    return (
        <>
            <Captcha />
            {createPortal(
                <div className='as-lg as-auth-captcha' tabIndex={0}>
                    <div className='as-auth-captcha-mark'>
                        <RecaptchaMark />
                    </div>
                    <div className='as-auth-captcha-text'>
                        <strong>Protected by reCAPTCHA</strong>
                        <span>
                            <a href='https://policies.google.com/privacy' target='_blank' rel='noreferrer'>
                                Privacy
                            </a>{' '}
                            ·{' '}
                            <a href='https://policies.google.com/terms' target='_blank' rel='noreferrer'>
                                Terms
                            </a>
                        </span>
                    </div>
                </div>,
                document.body
            )}
        </>
    );
}

type Model<K extends 'page.auth.login' | 'page.auth.password' | 'page.auth.passwordReset' | 'page.auth.checkpoint'> =
    ViewProps<K>['model'];

export function AuthLoginPage({
    model,
    className,
    google = model.google ? <GoogleSignIn model={model.google} /> : undefined,
    discord = model.discord ? <DiscordSignIn model={model.discord} /> : undefined,
}: {
    model: Model<'page.auth.login'>;
    className?: string;
    google?: ReactNode;
    discord?: ReactNode;
}) {
    const { fields, Captcha } = model;

    return (
        <AuthCard
            className={className}
            title='Welcome back'
            lede='Sign in to your Astrelyse server panel.'
            submit={model.submit}
            footer={<PanelLink destination={model.forgotPassword}>Forgot password?</PanelLink>}
        >
            {(google || discord) && (
                <>
                    {google}
                    {discord}
                    <div className='as-auth-or'>or</div>
                </>
            )}
            <AuthField field={fields.username} label='Username or Email' />
            <AuthField field={fields.password} label='Password' />
            <Slot name='auth.login.form.after' data={model.route} />
            <CaptchaSlot Captcha={Captcha} />
            <AuthButton disabled={!model.canSubmit} loading={model.submitting}>
                Sign in
            </AuthButton>
        </AuthCard>
    );
}

export function AuthForgotPasswordPage({
    model,
    className,
}: {
    model: Model<'page.auth.password'>;
    className?: string;
}) {
    const { Captcha } = model;

    return (
        <AuthCard
            className={className}
            title='Reset your password'
            lede='Enter your account email and we will send you reset instructions.'
            submit={model.submit}
            footer={<PanelLink destination={model.login}>Back to sign in</PanelLink>}
        >
            <AuthField field={model.fields.email} label='Email' />
            <CaptchaSlot Captcha={Captcha} />
            <AuthButton disabled={!model.canSubmit} loading={model.submitting}>
                Send email
            </AuthButton>
        </AuthCard>
    );
}

export function AuthResetPasswordPage({
    model,
    className,
}: {
    model: Model<'page.auth.passwordReset'>;
    className?: string;
}) {
    const { fields, Captcha } = model;

    return (
        <AuthCard
            className={className}
            title='Choose a new password'
            lede='Set a new password for your Astrelyse server panel account.'
            submit={model.submit}
            footer={<PanelLink destination={model.login}>Back to sign in</PanelLink>}
        >
            <label className='as-ui-field'>
                <span className='as-ui-field-label'>Email</span>
                <input className='as-ui-input' value={model.email} disabled readOnly />
            </label>
            <AuthField field={fields.password} label='New password' hint='At least 8 characters.' />
            <AuthField field={fields.passwordConfirmation} label='Confirm new password' />
            <CaptchaSlot Captcha={Captcha} />
            <AuthButton disabled={!model.canSubmit} loading={model.submitting}>
                Reset password
            </AuthButton>
        </AuthCard>
    );
}

export function AuthCheckpointPage({ model, className }: { model: Model<'page.auth.checkpoint'>; className?: string }) {
    const { recovery } = model;
    const code = model.fields.code;

    if (model.step === 'passkey') {
        return (
            <AuthCard
                className={className}
                title='Use your passkey'
                lede='Confirm it is you with the passkey on your device to open your server panel.'
                footer={<PanelLink destination={model.login}>Back to sign in</PanelLink>}
            >
                {model.passkey.error && (
                    <p className='as-auth-msg' data-tone='error' role='alert'>
                        {model.passkey.error}
                    </p>
                )}
                <button
                    type='button'
                    className='as-btn as-ui-btn as-btn-primary'
                    disabled={model.passkey.busy}
                    onClick={model.passkey.run}
                >
                    {model.passkey.busy && <span className='as-ui-spin' aria-hidden='true' />}
                    Use passkey
                </button>
            </AuthCard>
        );
    }

    return (
        <AuthCard
            className={className}
            title='Two-factor check'
            lede='Enter the code from your authenticator app to open your server panel.'
            submit={model.submit}
            footer={
                <>
                    <button type='button' className='as-auth-link' onClick={model.toggleRecovery}>
                        {recovery ? 'Use my authenticator app' : 'Use a recovery code'}
                    </button>
                    <PanelLink destination={model.login}>Back to sign in</PanelLink>
                </>
            }
        >
            {recovery ? (
                <AuthField field={code} label='Recovery code' autoFocus />
            ) : (
                <div className='as-ui-field' data-invalid={code.error ? '' : undefined}>
                    <span className='as-ui-field-label'>6-digit code</span>
                    <OtpInput
                        name={code.fieldProps.name}
                        value={code.fieldProps.value}
                        onChange={(next) =>
                            code.fieldProps.onChange({
                                currentTarget: { value: next },
                            } as ChangeEvent<HTMLInputElement>)
                        }
                        status={code.error ? 'error' : 'idle'}
                        disabled={model.submitting}
                        autoFocus
                    />
                    {code.error && (
                        <span className='as-ui-field-msg as-ui-field-error' role='alert'>
                            {code.error}
                        </span>
                    )}
                </div>
            )}
            <AuthButton disabled={!model.canSubmit} loading={model.submitting}>
                Verify
            </AuthButton>
        </AuthCard>
    );
}
