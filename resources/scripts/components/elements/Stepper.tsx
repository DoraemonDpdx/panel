import React, { useRef } from 'react';
import { Check } from 'lucide-react';
import { replaceable, useSkin } from '@/themes/skins';

export type StepStatus = 'complete' | 'current' | 'upcoming';

export interface Step {
    id: string;
    label: React.ReactNode;
    description?: React.ReactNode;
}

export interface StepperProps {
    steps: readonly Step[];
    /** The index of the step in progress. */
    current: number;
    /** When given, steps up to the current one can be revisited; they become buttons in one roving tab stop. */
    onStepSelect?: (index: number) => void;
    label?: string;
    className?: string;
}

function statusOf(index: number, current: number): StepStatus {
    if (index < current) {
        return 'complete';
    }

    return index === current ? 'current' : 'upcoming';
}

const STATUS_HINTS = { complete: ' (completed)', current: ' (current step)', upcoming: '' } satisfies Record<
    StepStatus,
    string
>;

/** The step a key moves focus to, or undefined for a key that is not navigation. */
function targetOf(key: string, from: number, reachable: number): number | undefined {
    switch (key) {
        case 'ArrowRight':
        case 'ArrowDown':
            return Math.min(from + 1, reachable);
        case 'ArrowLeft':
        case 'ArrowUp':
            return Math.max(from - 1, 0);
        case 'Home':
            return 0;
        case 'End':
            return reachable;
        default:
            return undefined;
    }
}

/** The steps of a wizard. The current step is `aria-current="step"`; its state is text and a check, never colour alone. */
function CoreStepper({ steps, current, onStepSelect, label = 'Progress', className }: StepperProps) {
    const ui = useSkin('Stepper', { interactive: !!onStepSelect });
    const buttons = useRef<(HTMLButtonElement | null)[]>([]);

    const move = (from: number, event: React.KeyboardEvent) => {
        const reachable = Math.min(current, steps.length - 1);
        const target = targetOf(event.key, from, reachable);

        if (target !== undefined) {
            event.preventDefault();
            buttons.current[target]?.focus();
        }
    };

    return (
        <nav aria-label={label} {...ui('root', className)}>
            <ol {...ui('list')}>
                {steps.map((step, index) => {
                    const status = statusOf(index, current);
                    const state = { status };
                    const content = (
                        <>
                            <span {...ui('marker', undefined, state)} aria-hidden>
                                {status === 'complete' ? <Check {...ui('check')} /> : index + 1}
                            </span>
                            <span {...ui('text')}>
                                <span {...ui('label', undefined, state)}>{step.label}</span>
                                {step.description && <span {...ui('description')}>{step.description}</span>}
                            </span>
                            <span className='sr-only'>{STATUS_HINTS[status]}</span>
                        </>
                    );

                    return (
                        <li key={step.id} {...ui('item', undefined, state)}>
                            {onStepSelect && status !== 'upcoming' ? (
                                <button
                                    type='button'
                                    ref={(element) => {
                                        buttons.current[index] = element;
                                    }}
                                    {...ui('step', undefined, state)}
                                    tabIndex={status === 'current' ? 0 : -1}
                                    aria-current={status === 'current' ? 'step' : undefined}
                                    onClick={() => onStepSelect(index)}
                                    onKeyDown={(event) => move(index, event)}
                                >
                                    {content}
                                </button>
                            ) : (
                                <div
                                    {...ui('step', undefined, state)}
                                    aria-current={status === 'current' ? 'step' : undefined}
                                >
                                    {content}
                                </div>
                            )}
                        </li>
                    );
                })}
            </ol>
        </nav>
    );
}

const Stepper = replaceable('Stepper', CoreStepper);

export default Stepper;
