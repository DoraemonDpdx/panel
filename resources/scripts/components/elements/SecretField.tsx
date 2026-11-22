import React, { useId } from 'react';
import SecretInput from '@/components/elements/SecretInput';
import { replaceable, useSkin } from '@/themes/skins';

export interface SecretFieldProps {
    /** What the secret is, such as "API key"; names the field and its buttons. */
    label: string;
    value: string | null | undefined;
    description?: React.ReactNode;
    /** Called each time the user reveals the secret, so the caller can write an audit entry. Copying does not reveal. */
    onReveal?: () => void;
    id?: string;
    className?: string;
}

/** A masked secret with reveal and copy: for environment values, API keys and database or Lavalink passwords. */
function CoreSecretField({ label, value, description, onReveal, id, className }: SecretFieldProps) {
    const generated = useId();
    const fieldId = id ?? generated;
    const ui = useSkin('SecretField', { empty: !value });

    return (
        <div {...ui('root', className)}>
            <label htmlFor={fieldId} {...ui('label')}>
                {label}
            </label>
            <div {...ui('control')}>
                <SecretInput id={fieldId} value={value} label={label} onReveal={onReveal} />
            </div>
            {description && <p {...ui('description')}>{description}</p>}
        </div>
    );
}

const SecretField = replaceable('SecretField', CoreSecretField);

export default SecretField;
