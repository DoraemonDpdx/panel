import { useRef, useState, type ChangeEvent, type ClipboardEvent, type CSSProperties, type KeyboardEvent } from 'react';
import './otp-input.css';

export interface OtpInputProps {
    value: string;
    onChange: (code: string) => void;
    /** Called once, when the last slot is filled. */
    onComplete?: (code: string) => void;
    length?: number;
    /** `error` tints the slots and shakes the row; `incomplete` turns only the entered slots red; `success` locks the input. */
    status?: 'idle' | 'error' | 'incomplete' | 'success';
    disabled?: boolean;
    autoFocus?: boolean;
    name?: string;
    ariaLabel?: string;
}

const digits = (value: string) => value.replaceAll(/\D/g, '');

const srText = (status: OtpInputProps['status'], entered: number, length: number): string => {
    if (status === 'success') {
        return 'Code accepted';
    }

    if (status === 'error') {
        return 'Code rejected';
    }

    return `${entered} of ${length} digits entered`;
};

function ResultMark({ status }: { status: 'success' | 'error' }) {
    return (
        <span className='ui-otp-mark' key={status} aria-hidden='true'>
            <svg viewBox='0 0 52 52'>
                <circle className='ui-otp-mark-ring' cx='26' cy='26' r='23' pathLength={1} />
                {status === 'success' ? (
                    <path className='ui-otp-mark-glyph' d='M15.5 27.5l7 7L37 19.5' pathLength={1} />
                ) : (
                    <>
                        <path className='ui-otp-mark-glyph' d='M18.5 18.5l15 15' pathLength={1} />
                        <path className='ui-otp-mark-glyph ui-otp-mark-glyph2' d='M33.5 18.5l-15 15' pathLength={1} />
                    </>
                )}
            </svg>
        </span>
    );
}

/** The website's one-time-code entry: glass slots, a ring that glides to the active slot, digits masked as `*`. */
export default function OtpInput({
    value,
    onChange,
    onComplete,
    length = 6,
    status = 'idle',
    disabled = false,
    autoFocus = false,
    name,
    ariaLabel = 'Authenticator code',
}: OtpInputProps) {
    const ref = useRef<HTMLInputElement>(null);
    const [focused, setFocused] = useState(false);
    const locked = disabled || status === 'success';
    const code = digits(value).slice(0, length);
    const active = Math.min(code.length, length - 1);

    const emit = (raw: string) => {
        const next = digits(raw).slice(0, length);

        if (next === code) {
            return;
        }

        onChange(next);

        if (next.length === length && code.length < length) {
            onComplete?.(next);
        }
    };

    // Slots fill left to right, so the caret always sits at the end.
    const toEnd = () => ref.current?.setSelectionRange(ref.current.value.length, ref.current.value.length);

    return (
        <div
            className='ui-otp'
            data-status={status}
            data-focused={focused ? '' : undefined}
            data-disabled={disabled ? '' : undefined}
            style={{ '--otp-n': length, '--otp-i': active } as CSSProperties}
            onMouseDown={(event) => {
                if (disabled) {
                    return;
                }

                event.preventDefault();
                ref.current?.focus();
                toEnd();
            }}
        >
            <input
                ref={ref}
                className='ui-otp-input'
                name={name}
                type='text'
                inputMode='numeric'
                pattern='[0-9]*'
                autoComplete='one-time-code'
                value={code}
                maxLength={length + 4}
                disabled={disabled}
                readOnly={status === 'success'}
                autoFocus={autoFocus}
                aria-label={ariaLabel}
                aria-invalid={status === 'error' || status === 'incomplete'}
                onChange={(event: ChangeEvent<HTMLInputElement>) => {
                    if (!locked) {
                        emit(event.target.value);
                    }
                }}
                onPaste={(event: ClipboardEvent<HTMLInputElement>) => {
                    if (locked) {
                        return;
                    }

                    event.preventDefault();
                    emit(event.clipboardData.getData('text'));
                }}
                onKeyDown={(event: KeyboardEvent<HTMLInputElement>) => {
                    if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) {
                        event.preventDefault();
                    }
                }}
                onSelect={toEnd}
                onFocus={() => {
                    setFocused(true);
                    toEnd();
                }}
                onBlur={() => setFocused(false)}
            />
            {Array.from({ length }, (_, index) => (
                <span
                    key={index}
                    className='ui-otp-slot'
                    style={{ '--i': index } as CSSProperties}
                    data-active={focused && !locked && index === active ? '' : undefined}
                    data-filled={code[index] ? '' : undefined}
                    aria-hidden='true'
                >
                    {code[index] && <span className='ui-otp-star'>*</span>}
                    {focused && !locked && index === active && !code[index] && <span className='ui-otp-caret' />}
                </span>
            ))}
            <span className='ui-otp-glide' data-on={focused && !locked ? '' : undefined} aria-hidden='true' />
            {(status === 'success' || status === 'error') && <ResultMark status={status} />}
            <span className='ui-sr' aria-live='polite'>
                {srText(status, code.length, length)}
            </span>
        </div>
    );
}
