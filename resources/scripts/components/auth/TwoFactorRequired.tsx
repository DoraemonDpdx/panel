import { useState, type FormEvent, type ReactNode } from 'react';
import { useNavigate, useSearch } from '@tanstack/react-router';
import { useAccountTwoFactorToken, useEnableAccountTwoFactor } from '@/api/account/two-factor/queries';
import http, { httpErrorToHuman } from '@/api/http';
import { AuthButton, AuthFrame } from '@/components/auth/AuthShell';
import OtpInput from '@/components/auth/OtpInput';
import { CopyOnClick, QrCode, Spinner } from '@/sdk';

type Step = 'password' | 'setup' | 'codes';

function Card({ title, lede, children }: { title: string; lede: string; children: ReactNode }) {
    return (
        <section className='as-ui-card as-ui-surface as-auth-card' data-wide>
            <div>
                <h1>{title}</h1>
                <p className='as-auth-lede'>{lede}</p>
            </div>
            {children}
        </section>
    );
}

function Msg({ children }: { children: ReactNode }) {
    return (
        <p className='as-auth-msg' data-tone='error' role='alert'>
            {children}
        </p>
    );
}

function PasswordStep({ required, onDone }: { required: boolean; onDone: (password: string) => void }) {
    const navigate = useNavigate();
    const [password, setPassword] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);

    const submit = async (event: FormEvent) => {
        event.preventDefault();

        if (!password || busy) {
            return;
        }

        setBusy(true);
        setError(null);

        try {
            await http.post('/api/client/account/two-factor/password', { password });
            onDone(password);
        } catch (error_) {
            setError(httpErrorToHuman(error_));
        } finally {
            setBusy(false);
        }
    };

    return (
        <Card
            title='Confirm it’s you'
            lede={
                required
                    ? 'Your server panel account needs two-factor authentication. Enter your password to set it up.'
                    : 'Enter your password to set up two-factor authentication for your server panel.'
            }
        >
            <form onSubmit={(event) => void submit(event)} className='as-auth-form'>
                <label className='as-ui-field'>
                    <span className='as-ui-field-label'>Password</span>
                    <input
                        className='as-ui-input'
                        type='password'
                        value={password}
                        onChange={(event) => setPassword(event.currentTarget.value)}
                        autoComplete='current-password'
                        autoFocus
                    />
                </label>
                {error && <Msg>{error}</Msg>}
                <AuthButton disabled={!password} loading={busy}>
                    Continue
                </AuthButton>
            </form>
            {!required && (
                <div className='as-auth-foot'>
                    <button
                        type='button'
                        className='as-auth-link'
                        onClick={() => void navigate({ to: '/account', replace: true })}
                    >
                        Maybe later
                    </button>
                </div>
            )}
        </Card>
    );
}

function SetupStep({
    password,
    onBack,
    onDone,
}: {
    password: string;
    onBack: () => void;
    onDone: (tokens: readonly string[]) => void;
}) {
    const secret = useAccountTwoFactorToken();
    const enable = useEnableAccountTwoFactor();
    const [code, setCode] = useState('');
    const [otp, setOtp] = useState<'idle' | 'error' | 'success'>('idle');
    const setup = secret.data?.data;
    const failed = secret.error && !secret.isFetching ? httpErrorToHuman(secret.error) : null;
    const canSubmit = !!setup && code.length === 6 && !enable.isPending && otp === 'idle';

    const verify = async (value: string) => {
        if (!setup || enable.isPending || otp !== 'idle') {
            return;
        }

        try {
            const response = await enable.mutateAsync({ body: { code: value, password } });

            setOtp('success');
            // Let the tick finish drawing before showing the recovery codes.
            setTimeout(() => onDone(response.attributes.tokens), 1150);
        } catch {
            setOtp('error');
            setTimeout(() => {
                setCode('');
                setOtp('idle');
            }, 1400);
        }
    };

    return (
        <Card
            title='Two-factor check'
            lede='Protect your server panel account with a code from your authenticator app.'
        >
            <form
                className='as-auth-form'
                data-enrol=''
                onSubmit={(event) => {
                    event.preventDefault();

                    if (canSubmit) {
                        void verify(code);
                    }
                }}
            >
                <div className='as-auth-setup'>
                    <div className='as-auth-qr'>
                        {setup ? (
                            <QrCode value={setup.image_url_data} className='size-full shadow-none' />
                        ) : (
                            <Spinner />
                        )}
                    </div>
                    <div className='as-auth-setup-body'>
                        <p className='as-auth-setup-note'>
                            Scan this with an authenticator app (Google Authenticator, 1Password, Authy), then enter the
                            first code. You will be asked for a code each time you sign in.
                        </p>
                        <CopyOnClick text={setup?.secret}>
                            <p className='as-auth-secret'>
                                {setup?.secret.match(/.{1,4}/g)?.join(' ') ?? 'Loading...'}
                            </p>
                        </CopyOnClick>
                    </div>
                </div>
                <div className='as-auth-enter'>
                    {failed && <Msg>{failed}</Msg>}
                    <div className='as-ui-field'>
                        <span className='as-ui-field-label'>6-digit code</span>
                        <OtpInput
                            name='code'
                            value={code}
                            onChange={setCode}
                            status={otp}
                            disabled={enable.isPending}
                            autoFocus
                        />
                    </div>
                    <AuthButton disabled={!canSubmit} loading={enable.isPending}>
                        Turn on and continue
                    </AuthButton>
                </div>
            </form>
            <div className='as-auth-foot'>
                <button type='button' className='as-auth-link' onClick={onBack}>
                    Back
                </button>
            </div>
        </Card>
    );
}

function RecoveryCodes({ tokens, onDone }: { tokens: readonly string[]; onDone: () => void }) {
    return (
        <Card
            title='Two-factor is on'
            lede='Save these recovery codes somewhere safe. Each works once if you lose your device, and they will not be shown again.'
        >
            <div className='as-auth-secret' style={{ whiteSpace: 'pre-line' }}>
                {tokens.join('\n')}
            </div>
            <button type='button' className='as-btn as-ui-btn as-btn-primary' onClick={onDone}>
                Continue to the panel
            </button>
        </Card>
    );
}

/**
 * Full-screen two-factor enrolment shown straight after sign-in when the account must use it, in place of
 * the panel; also where optional setup from the Account page lands. Password first, then the scan step.
 */
export default function TwoFactorRequired() {
    const navigate = useNavigate();
    const required = (useSearch({ strict: false }) as { required?: boolean }).required === true;
    const [step, setStep] = useState<Step>('password');
    const [password, setPassword] = useState('');
    const [tokens, setTokens] = useState<readonly string[]>([]);

    return (
        <AuthFrame>
            {step === 'password' && (
                <PasswordStep
                    required={required}
                    onDone={(value) => {
                        setPassword(value);
                        setStep('setup');
                    }}
                />
            )}
            {step === 'setup' && (
                <SetupStep
                    password={password}
                    onBack={() => setStep('password')}
                    onDone={(value) => {
                        setTokens(value);
                        setStep('codes');
                    }}
                />
            )}
            {step === 'codes' && (
                <RecoveryCodes tokens={tokens} onDone={() => void navigate({ to: '/', replace: true })} />
            )}
        </AuthFrame>
    );
}
