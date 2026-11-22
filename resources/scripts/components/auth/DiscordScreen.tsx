import { useEffect, useState, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import DiscordIcon from './DiscordIcon';

export interface DiscordScreenAction {
    readonly label: string;
    /** `primary` is the filled call to action; `ghost` is the quieter alternative. */
    readonly tone?: 'primary' | 'ghost';
    /** Keeps the screen open and shows progress until it settles. Resolve with `false` to stay open. */
    readonly onSelect: () => Promise<boolean | void> | boolean | void;
}

export interface DiscordScreenOptions {
    readonly tone?: 'info' | 'error';
    readonly title: string;
    readonly body: ReactNode;
    readonly actions: readonly DiscordScreenAction[];
}

function DiscordScreen({ tone = 'info', title, body, actions, close }: DiscordScreenOptions & { close: () => void }) {
    const [busy, setBusy] = useState(false);
    const dismiss = actions.find((action) => action.tone === 'ghost' && tone === 'error') ?? null;

    async function select(action: DiscordScreenAction) {
        setBusy(true);

        try {
            if ((await action.onSelect()) !== false) {
                close();

                return;
            }
        } finally {
            setBusy(false);
        }
    }

    useEffect(() => {
        if (!dismiss) {
            return;
        }

        const onKey = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                void select(dismiss);
            }
        };

        window.addEventListener('keydown', onKey);

        return () => window.removeEventListener('keydown', onKey);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [dismiss]);

    return (
        <div className='fixed inset-0 z-[100] flex items-center justify-center bg-background/80 p-4 backdrop-blur-md'>
            <div
                role='alertdialog'
                aria-modal='true'
                aria-labelledby='discord-screen-title'
                aria-busy={busy}
                className='flex min-h-[28rem] w-full max-w-2xl flex-col items-center justify-center gap-8 rounded-3xl border border-input-border bg-input p-8 text-center text-primary-foreground shadow-2xl sm:p-14'
            >
                <div
                    className={`flex size-20 items-center justify-center rounded-full ${tone === 'error' ? 'bg-destructive/15 text-destructive' : 'bg-primary/20 text-primary-foreground'}`}
                >
                    <DiscordIcon width={40} />
                </div>
                <div className='flex flex-col gap-3'>
                    <h2 id='discord-screen-title' className='text-3xl font-semibold tracking-tight'>
                        {title}
                    </h2>
                    <div className='mx-auto max-w-md text-base leading-relaxed text-primary-foreground/70'>{body}</div>
                </div>
                <div className='flex w-full max-w-sm flex-col gap-3'>
                    {actions.map((action) => (
                        <button
                            key={action.label}
                            type='button'
                            disabled={busy}
                            onClick={() => void select(action)}
                            className={
                                action.tone === 'ghost'
                                    ? 'min-h-12 rounded-xl px-4 text-base text-primary-foreground/80 hover:text-primary-foreground disabled:opacity-50'
                                    : 'min-h-12 rounded-xl bg-primary px-4 text-base font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-60'
                            }
                        >
                            {busy && action.tone !== 'ghost' ? 'Working…' : action.label}
                        </button>
                    ))}
                </div>
            </div>
        </div>
    );
}

/** Full-screen Discord notice: the one place every Discord sign-in message is shown. Returns a function that closes it. */
export function openDiscordScreen(options: DiscordScreenOptions): () => void {
    const host = document.createElement('div');

    document.body.append(host);

    const root = createRoot(host);
    const close = () => {
        root.unmount();
        host.remove();
    };

    root.render(<DiscordScreen {...options} close={close} />);

    return close;
}
