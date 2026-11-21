import { useState } from 'react';
import { Button, ContentBox, Dialog, Input } from '@/sdk';
import type { ViewProps } from '@/sdk/theme';

const NAME_MAX = 60;

const formatDate = (value: string) => (value ? new Date(value).toLocaleDateString() : '');

function validateName(trimmed: string, taken: readonly string[]): string | null {
    if (trimmed.length === 0) {
        return 'Give this passkey a name.';
    }

    if (trimmed.length > NAME_MAX) {
        return `Keep the name to ${NAME_MAX} characters or fewer.`;
    }

    return taken.includes(trimmed.toLowerCase()) ? 'You already have a passkey with that name.' : null;
}

export default function PasskeysCard({ model, className }: ViewProps<'account.passkeys'>) {
    const [naming, setNaming] = useState(false);
    const [name, setName] = useState('');
    const [removingId, setRemovingId] = useState<number | null>(null);
    const [password, setPassword] = useState('');

    const trimmed = name.trim();
    const nameProblem = validateName(
        trimmed,
        model.passkeys.map((passkey) => passkey.name.toLowerCase())
    );
    const target = model.passkeys.find((passkey) => passkey.id === removingId) ?? null;

    return (
        <ContentBox className={className} title='Passkeys'>
            <p className='text-sm'>
                A passkey is an extra sign-in step that uses your device&apos;s fingerprint, face or PIN, or a security
                key. Once you add one, every sign-in asks for it after your password and authenticator code. Remove them
                all and the step is switched off.
            </p>
            <ul className='mt-4 space-y-2'>
                {model.loading && <li className='text-sm text-muted-foreground'>Loading passkeys...</li>}
                {model.passkeys.map((passkey) => (
                    <li key={passkey.id} className='flex items-center justify-between gap-3 text-sm'>
                        <span>
                            {passkey.name}
                            <span className='text-muted-foreground'>
                                {' '}
                                &middot; added {formatDate(passkey.createdAt)}
                                {passkey.lastUsedAt ? ` · last used ${formatDate(passkey.lastUsedAt)}` : ''}
                            </span>
                        </span>
                        <Button.Danger
                            size='xsmall'
                            onClick={() => {
                                setPassword('');
                                setRemovingId(passkey.id);
                            }}
                        >
                            Remove
                        </Button.Danger>
                    </li>
                ))}
            </ul>
            {model.error && <p className='mt-4 text-sm text-destructive'>{model.error}</p>}
            <div className='mt-6'>
                <Button
                    isLoading={model.adding}
                    onClick={() => {
                        setName(model.suggestName());
                        setNaming(true);
                    }}
                >
                    Add a Passkey
                </Button>
            </div>

            <Dialog
                open={naming}
                onClose={() => setNaming(false)}
                preventExternalClose={model.adding}
                hideCloseIcon={model.adding}
                title='Name this passkey'
                description='Pick a name you will recognise later, such as the device or security key it lives on. Your device asks you to confirm next.'
            >
                <form
                    id='add-passkey-form'
                    className='mt-6'
                    onSubmit={(event) => {
                        event.preventDefault();
                        event.stopPropagation();

                        if (nameProblem) {
                            return;
                        }

                        void model.add(trimmed).then((added) => {
                            if (added) {
                                setNaming(false);
                            }
                        });
                    }}
                >
                    <label className='block pb-1' htmlFor='passkey-name'>
                        Passkey name
                    </label>
                    <Input
                        id='passkey-name'
                        value={name}
                        maxLength={NAME_MAX}
                        autoComplete='off'
                        placeholder='MacBook, YubiKey...'
                        autoFocus
                        disabled={model.adding}
                        onChange={(event) => setName(event.target.value)}
                    />
                    {nameProblem && trimmed.length > 0 && (
                        <p className='mt-2 text-xs text-destructive'>{nameProblem}</p>
                    )}
                    <Dialog.Footer>
                        <Button.Text onClick={() => setNaming(false)} disabled={model.adding}>
                            Cancel
                        </Button.Text>
                        <Button
                            type='submit'
                            form='add-passkey-form'
                            disabled={nameProblem !== null}
                            isLoading={model.adding}
                        >
                            Continue
                        </Button>
                    </Dialog.Footer>
                </form>
            </Dialog>

            <Dialog
                open={target !== null}
                onClose={() => setRemovingId(null)}
                preventExternalClose={model.removing}
                hideCloseIcon={model.removing}
                title={`Remove ${target?.name ?? 'passkey'}`}
                description='Enter your account password to remove this passkey.'
            >
                <form
                    id='remove-passkey-form'
                    className='mt-6'
                    onSubmit={(event) => {
                        event.preventDefault();
                        event.stopPropagation();

                        if (target) {
                            void model.remove(target.id, password).then((removed) => {
                                if (removed) {
                                    setRemovingId(null);
                                }
                            });
                        }
                    }}
                >
                    <label className='block pb-1' htmlFor='passkey-password'>
                        Password
                    </label>
                    <Input
                        id='passkey-password'
                        type='password'
                        autoComplete='current-password'
                        value={password}
                        onChange={(event) => setPassword(event.target.value)}
                    />
                    <Dialog.Footer>
                        <Button.Text onClick={() => setRemovingId(null)}>Cancel</Button.Text>
                        <Button.Danger
                            type='submit'
                            form='remove-passkey-form'
                            disabled={password.length === 0}
                            isLoading={model.removing}
                        >
                            Remove
                        </Button.Danger>
                    </Dialog.Footer>
                </form>
            </Dialog>
        </ContentBox>
    );
}
