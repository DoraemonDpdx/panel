/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { groupLogEntries, parseLogLine } from '@/components/server/console/logParser';
import ConsoleToolbar from '@/themes/classic/views/server/console/ConsoleToolbar';
import LogViewer from '@/themes/classic/views/server/console/LogViewer';
import SavedCommandsBar from '@/themes/classic/views/server/console/SavedCommandsBar';
import EulaPrompt from '@/themes/classic/views/server/console/prompts/EulaPrompt';
import GslTokenPrompt from '@/themes/classic/views/server/console/prompts/GslTokenPrompt';
import PidLimitPrompt from '@/themes/classic/views/server/console/prompts/PidLimitPrompt';
import type { ServerConsoleToolbar, ServerLogViewerModel, ServerSavedCommands } from './console';

let portal: HTMLElement;

beforeAll(() => {
    portal = document.body.appendChild(Object.assign(document.createElement('div'), { id: 'modal-portal' }));
    Element.prototype.scrollTo = () => {};
});

afterAll(() => portal.remove());
afterEach(cleanup);

const toolbar = (options: Partial<ServerConsoleToolbar> = {}): ServerConsoleToolbar => ({
    search: '',
    setSearch: vi.fn(),
    filters: [],
    toggleFilter: vi.fn(),
    clearFilters: vi.fn(),
    timestamps: false,
    setTimestamps: vi.fn(),
    structured: false,
    setStructured: vi.fn(),
    paused: false,
    setPaused: vi.fn(),
    clear: vi.fn(),
    download: vi.fn(),
    ...options,
});

describe('console toolbar', () => {
    it('searches, toggles filter chips and runs the actions', () => {
        const tools = toolbar({ filters: ['error'] });

        render(<ConsoleToolbar toolbar={tools} />);

        fireEvent.change(screen.getByRole('searchbox', { name: 'Search the log' }), { target: { value: 'oops' } });
        expect(tools.setSearch).toHaveBeenCalledWith('oops');

        expect(screen.getByRole('button', { name: 'Errors' })).toHaveAttribute('aria-pressed', 'true');
        fireEvent.click(screen.getByRole('button', { name: 'Players' }));
        expect(tools.toggleFilter).toHaveBeenCalledWith('players');

        fireEvent.click(screen.getByRole('button', { name: 'Pause output' }));
        expect(tools.setPaused).toHaveBeenCalledWith(true);
        fireEvent.click(screen.getByRole('button', { name: 'Timestamps' }));
        expect(tools.setTimestamps).toHaveBeenCalledWith(true);
        fireEvent.click(screen.getByRole('button', { name: 'Structured view' }));
        expect(tools.setStructured).toHaveBeenCalledWith(true);
        fireEvent.click(screen.getByRole('button', { name: 'Download log' }));
        expect(tools.download).toHaveBeenCalled();
        fireEvent.click(screen.getByRole('button', { name: 'Clear console' }));
        expect(tools.clear).toHaveBeenCalled();
    });

    it('offers to resume while paused', () => {
        render(<ConsoleToolbar toolbar={toolbar({ paused: true })} />);

        expect(screen.getByRole('button', { name: 'Resume output' })).toHaveAttribute('aria-pressed', 'true');
    });
});

const viewer = (lines: string[], options: Partial<ServerLogViewerModel> = {}): ServerLogViewerModel => ({
    entries: groupLogEntries(lines.map((line) => parseLogLine(line, 0))),
    total: lines.length,
    search: '',
    timestamps: false,
    paused: false,
    ...options,
});

describe('structured log viewer', () => {
    const lines = [
        '[12:00:01 INFO]: Done',
        '[12:00:02 ERROR]: Could not load plugin',
        '\tat org.Loader.load(Loader.java:10)',
        '\tat org.Loader.run(Loader.java:20)',
        '{"level":"warn","msg":"slow tick","ms":51}',
    ];

    it('collapses a stack trace into one block that expands', () => {
        render(<LogViewer viewer={viewer(lines)} />);

        expect(screen.queryByText(/Loader\.java:10/)).not.toBeInTheDocument();
        const block = screen.getByRole('button', { name: /Could not load plugin/ });

        expect(block).toHaveAttribute('aria-expanded', 'false');
        expect(within(block).getByText('2 lines')).toBeInTheDocument();

        fireEvent.click(block);
        expect(screen.getByText(/Loader\.java:10/)).toBeInTheDocument();
        expect(block).toHaveAttribute('aria-expanded', 'true');
    });

    it('shows the message and fields of a JSON line', () => {
        render(<LogViewer viewer={viewer(lines)} />);

        expect(screen.getByText('slow tick')).toBeInTheDocument();
        expect(screen.getByText('ms=51')).toBeInTheDocument();
    });

    it('highlights the search and says when nothing matches', () => {
        const { container, rerender } = render(<LogViewer viewer={viewer(lines, { search: 'slow' })} />);

        expect(container.querySelector('mark')).toHaveTextContent('slow');

        rerender(<LogViewer viewer={viewer([], { total: 5, search: 'zzz' })} />);
        expect(screen.getByText('No lines match the search and filters.')).toBeInTheDocument();
    });

    it('prefixes timestamps when asked', () => {
        render(<LogViewer viewer={viewer(['hello'], { timestamps: true })} />);

        expect(screen.getByText(/^\d\d:\d\d:\d\d$/)).toBeInTheDocument();
    });
});

const saved = (options: Partial<ServerSavedCommands> = {}): ServerSavedCommands => ({
    allowed: true,
    loading: false,
    commands: [
        { id: 1, label: 'Save world', command: 'save-all', confirm: false, position: 0 },
        { id: 2, label: 'Say restarting', command: 'say Restarting', confirm: true, position: 1 },
    ],
    disabled: false,
    run: vi.fn(),
    manage: {
        pending: false,
        add: vi.fn(async () => {}),
        edit: vi.fn(async () => {}),
        remove: vi.fn(async () => {}),
        move: vi.fn(async () => {}),
    },
    ...options,
});

describe('saved commands', () => {
    it('sends a plain command at once', () => {
        const model = saved();

        render(<SavedCommandsBar saved={model} />);
        fireEvent.click(screen.getByRole('button', { name: 'Save world' }));

        expect(model.run).toHaveBeenCalledWith(expect.objectContaining({ command: 'save-all' }));
    });

    it('asks before sending a command with the confirm flag', async () => {
        const model = saved();

        render(<SavedCommandsBar saved={model} />);
        fireEvent.click(screen.getByRole('button', { name: 'Say restarting' }));
        expect(model.run).not.toHaveBeenCalled();

        fireEvent.click(await screen.findByRole('button', { name: 'Send' }));
        expect(model.run).toHaveBeenCalledWith(expect.objectContaining({ command: 'say Restarting' }));
    });

    it('does not send while the console is disconnected', () => {
        render(<SavedCommandsBar saved={saved({ disabled: true })} />);

        expect(screen.getByRole('button', { name: 'Save world' })).toBeDisabled();
    });

    it('pins a new command from the manage dialog', async () => {
        const model = saved({ commands: [] });

        render(<SavedCommandsBar saved={model} />);
        fireEvent.click(screen.getByRole('button', { name: 'Pin a command' }));
        fireEvent.change(await screen.findByLabelText('Button label'), { target: { value: 'Save' } });
        fireEvent.change(screen.getByLabelText('Command'), { target: { value: 'save-all' } });
        fireEvent.click(screen.getByLabelText('Ask before sending'));
        fireEvent.click(screen.getByRole('button', { name: 'Pin command' }));

        expect(model.manage.add).toHaveBeenCalledWith({ label: 'Save', command: 'save-all', confirm: true });
    });

    it('renders nothing without the console permission', () => {
        const { container } = render(<SavedCommandsBar saved={saved({ allowed: false })} />);

        expect(container).toBeEmptyDOMElement();
    });
});

/** The layer below the theme's view; these specs render the theme's own view, so nothing renders it. */
const Default = () => null;

describe('prompt card stack', () => {
    it('shows an open prompt as a dismissible card, and nothing when closed', () => {
        const close = vi.fn();
        const model = { open: true, close, pending: false, accept: async () => {} };
        const { rerender } = render(<EulaPrompt Default={Default} model={model} />);

        expect(screen.getByText('Accept the Minecraft® EULA')).toBeInTheDocument();
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }));
        expect(close).toHaveBeenCalled();

        rerender(<EulaPrompt Default={Default} model={{ ...model, open: false }} />);
        expect(screen.queryByText('Accept the Minecraft® EULA')).not.toBeInTheDocument();
    });

    it('keeps the fix-it action', () => {
        const accept = vi.fn(async () => {});

        render(<EulaPrompt Default={Default} model={{ open: true, close: vi.fn(), pending: false, accept }} />);
        fireEvent.click(screen.getByRole('button', { name: 'I accept' }));

        expect(accept).toHaveBeenCalled();
    });

    it('cannot be dismissed while saving', () => {
        render(
            <EulaPrompt
                Default={Default}
                model={{ open: true, close: vi.fn(), pending: true, accept: async () => {} }}
            />
        );

        expect(screen.getByRole('button', { name: 'Dismiss' })).toBeDisabled();
    });

    it('stacks several cards side by side in one container', () => {
        render(
            <div>
                <PidLimitPrompt Default={Default} model={{ open: true, close: vi.fn(), admin: true }} />
                <GslTokenPrompt
                    Default={Default}
                    model={{ open: true, close: vi.fn(), pending: false, submit: async () => {} }}
                />
            </div>
        );

        expect(screen.getAllByRole('button', { name: 'Dismiss' })).toHaveLength(2);
        expect(screen.getByText('Memory or process limit reached')).toBeInTheDocument();
        expect(screen.getByText('Invalid GSL token')).toBeInTheDocument();
    });
});
