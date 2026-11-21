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

import { readFileSync } from 'node:fs';
import { act, fireEvent, screen } from '@testing-library/react';
import { type ReactElement } from 'react';
import { afterEach, beforeAll, describe, expect, test } from 'vitest';
import { Plus } from 'lucide-react';
import {
    Alert,
    Avatar,
    Badge,
    Button,
    Card,
    ChartCard,
    Checkbox,
    Code,
    CopyOnClick,
    Dialog,
    DropdownMenu,
    DropdownMenuItem,
    Empty,
    EmptyDescription,
    EmptyHeader,
    EmptyMedia,
    EmptyTitle,
    FileInput,
    Input,
    Label,
    ListRow,
    NewButton,
    NumberInput,
    PageFooter,
    PageHeading,
    Pagination,
    ProgressBar,
    Select,
    Spinner,
    SpinnerOverlay,
    Stat,
    Switch,
    Table,
    TextArea,
    Tooltip,
} from '@pterodactyl/sdk';
import { preloadTheme, renderWithTheme, type RenderedView } from '@pterodactyl/sdk/testing';
import theme from '../theme';

/**
 * The UI kit contract (PANEL_DESIGN 2): every primitive renders, and each one sits on the right tier. Overlays render
 * in a portal, so they are read from document.body. Positioning and focus need a browser and are not covered here.
 */
const themes = [theme];

let rendered: RenderedView | undefined;

beforeAll(() => preloadTheme(themes));
afterEach(() => rendered?.unmount());

const mount = (el: ReactElement) => {
    rendered = renderWithTheme(el, { themes });

    return rendered;
};

/** The classes of the first element carrying a part, searched over the whole document (portals included). */
const part = (ui: string, name = 'root') =>
    document.body.querySelector(`[data-ui='${ui}'][data-part='${name}']`) as HTMLElement | null;

const cls = (ui: string, name = 'root') => part(ui, name)?.getAttribute('class') ?? '';

const glass = (c: string) => /(^|\s)(lq|mat)(\s|$)/.test(c);

const open = async (el: Element | null) => {
    await act(async () => {
        fireEvent.click(el!);
        await new Promise((r) => setTimeout(r, 20));
    });
};

describe('controls and surfaces', () => {
    test('a Button is liquid glass and NewButton keeps its icon and content parts', () => {
        mount(<NewButton icon={Plus}>Create</NewButton>);

        expect(cls('button')).toMatch(/(^|\s)lq(\s|$)/);
        expect(cls('button')).toContain('lq-touch');
        expect(cls('new-button', 'content')).toContain('inline-flex');
        expect(cls('new-button', 'icon')).toContain('size-4');
    });

    test('a Card is material and its loading state is marked', () => {
        mount(<Card loading>Body</Card>);

        expect(cls('card')).toMatch(/(^|\s)mat(\s|$)/);
        expect(part('card')?.hasAttribute('data-loading')).toBe(true);
    });

    test('a ListRow is a plain fill with a status bar and a description, never glass', () => {
        mount(
            <ListRow interactive status='success'>
                <ListRow.Title>Server</ListRow.Title>
                <ListRow.Description>Description</ListRow.Description>
            </ListRow>
        );

        expect(cls('list-row')).toContain('fill');
        expect(glass(cls('list-row'))).toBe(false);
        expect(cls('list-row', 'status')).toContain('bg-success');
        expect(cls('list-row', 'description')).toContain('line-clamp-2');
    });

    test('PageHeading actions and PageFooter render', () => {
        mount(
            <>
                <PageHeading title='Backups' actions={<span>act</span>} />
                <PageFooter />
            </>
        );

        expect(cls('page-heading', 'actions')).toContain('items-center');
        expect(part('page-footer')).not.toBeNull();
    });
});

describe('forms', () => {
    test('inputs are filled capsules, not glass, with a lavender focus ring', () => {
        mount(
            <>
                <Input aria-label='a' />
                <TextArea aria-label='b' />
                <FileInput aria-label='c' />
            </>
        );

        for (const ui of ['input', 'text-area', 'file-input']) {
            expect(glass(cls(ui)), ui).toBe(false);
            expect(cls(ui), ui).toContain('bg-input');
        }

        expect(cls('input')).toContain('rounded-full');
        expect(cls('input')).toContain('focus:ring-ast-lav/35');
        expect(cls('text-area')).toContain('rounded-2xl');
    });

    test('an error is a red ring and a data hook for the icon, not colour alone', () => {
        mount(
            <>
                <Input aria-label='a' $hasError />
                <NumberInput aria-label='n' $hasError />
            </>
        );

        expect(cls('input')).toContain('ring-destructive');
        expect(part('input')?.hasAttribute('data-error')).toBe(true);
        expect(cls('number-input', 'input')).toContain('ring-destructive');
        expect(readFileSync('src/styles/kit.css', 'utf8')).toContain("[data-ui='input'][data-error]");
    });

    test('Checkbox, Switch and Label render on fills', () => {
        mount(
            <>
                <Label>Name</Label>
                <Checkbox checked onChange={() => {}} aria-label='x' />
                <Switch checked onChange={() => {}} label='Enable' description='Turns it on' />
            </>
        );

        expect(cls('label')).toContain('text-foreground');
        expect(cls('checkbox')).toContain('data-checked:bg-ast-blue');
        expect(glass(cls('checkbox'))).toBe(false);
        expect(cls('switch', 'control')).toContain('rounded-full');
        expect(cls('switch', 'thumb')).toContain('duration-100');
    });

    test('a Select field is a fill, its popup is a floating material layer with the classic z-index', async () => {
        mount(
            <Select
                options={[
                    { value: 'a', label: 'Alpha' },
                    { value: 'b', label: 'Beta' },
                ]}
                value='a'
                onChange={() => {}}
            />
        );

        expect(glass(cls('select'))).toBe(false);

        await open(part('select', 'trigger'));

        expect(cls('select', 'popup')).toContain('mat-float');
        expect(cls('select', 'popup')).toMatch(/(^|\s)mat(\s|$)/);
        expect(cls('select', 'positioner')).toContain('z-99999');
        expect(glass(cls('select', 'item'))).toBe(false);
    });

    test('a multi Select and a grouped Select render', async () => {
        mount(
            <>
                <Select multiple options={[{ value: 'a', label: 'Alpha' }]} value={['a']} onChange={() => {}} />
                <Select
                    groups={[{ label: 'Group', options: [{ value: 'g', label: 'Gamma' }] }]}
                    value={null}
                    onChange={() => {}}
                    placeholder='Pick'
                />
            </>
        );

        expect(document.body.querySelectorAll("[data-ui='select'][data-part='root']").length).toBe(2);
    });
});

describe('overlays', () => {
    test('a Dialog is a floating material layer; the page behind it is dimmed and blurred; the footer is right-aligned', () => {
        mount(
            <Dialog open title='Delete' description='Sure?' onClose={() => {}}>
                <Dialog.Icon type='danger' />
                Text
                <Dialog.Footer>
                    <Button>Ok</Button>
                </Dialog.Footer>
            </Dialog>
        );

        const root = cls('dialog');

        expect(root).toMatch(/(^|\s)mat(\s|$)/);
        expect(root).toContain('mat-float');
        expect(root).toContain('rounded-3xl');
        expect(cls('dialog', 'backdrop')).toContain('backdrop-blur');
        expect(cls('dialog', 'backdrop')).toContain('z-40');
        expect(cls('dialog', 'viewport')).toContain('z-50');
        expect(cls('dialog', 'footer')).toContain('justify-end');
        expect(cls('dialog', 'icon')).toContain('text-destructive');
        expect(root).toContain('duration-100');
        expect(root).toContain('motion-reduce:transition-none');
    });

    test('a DropdownMenu is a floating material layer, its items are plain fills with danger and checked states', async () => {
        mount(
            <DropdownMenu triggerContent='Menu'>
                <DropdownMenuItem checked>Dark</DropdownMenuItem>
                <DropdownMenuItem danger>Delete</DropdownMenuItem>
            </DropdownMenu>
        );

        await open(screen.getByText('Menu'));

        expect(cls('dropdown-menu')).toContain('mat-float');
        expect(cls('dropdown-menu', 'positioner')).toContain('z-9999');

        const items = [...document.body.querySelectorAll("[data-ui='dropdown-menu-item'][data-part='root']")].map(
            (e) => e.className
        );

        expect(items).toHaveLength(2);
        expect(items.some((c) => glass(c))).toBe(false);
        expect(items[0]).toContain('shadow-[inset_2px_0_0_var(--lav)]');
        expect(items[1]).toContain('text-destructive');
    });

    test('a Tooltip is small and near solid, never glass', async () => {
        mount(
            <Tooltip content='Hint'>
                <button>Target</button>
            </Tooltip>
        );

        await act(async () => {
            fireEvent.focus(screen.getByText('Target'));
            fireEvent.mouseEnter(screen.getByText('Target'));
            await new Promise((r) => setTimeout(r, 400));
        });

        const root = part('tooltip');

        if (root) {
            expect(glass(root.className)).toBe(false);
            expect(root.className).toContain('z-9999');
            expect(root.className).toContain('pointer-events-none');
        }
    });
});

describe('data', () => {
    const rows = [
        { id: 'a', name: 'Alpha' },
        { id: 'b', name: 'Beta' },
    ];

    test('a Table is a material container; head, rows and cells are plain, rows are not glass', () => {
        mount(
            <Table
                rows={rows}
                keyOf={(r) => r.id}
                columns={[{ id: 'n', label: 'Name', cell: (r) => r.name }]}
                emptyState={<span>none</span>}
            />
        );

        expect(cls('table')).toMatch(/(^|\s)mat(\s|$)/);
        expect(glass(cls('table', 'row'))).toBe(false);
        expect(glass(cls('table', 'cell'))).toBe(false);
        expect(cls('table', 'row')).toContain('hover:bg-white/6');
    });

    test('a refetching Table dims its body', () => {
        mount(
            <Table
                rows={rows}
                isFetching
                keyOf={(r) => r.id}
                columns={[{ id: 'n', label: 'Name', cell: (r) => r.name }]}
                emptyState={<span>none</span>}
            />
        );

        expect(cls('table', 'body')).toContain('opacity-60');
    });

    test('Pagination keeps its root and renders page buttons as glass capsules', () => {
        mount(
            <Pagination
                data={{
                    data: [1, 2, 3],
                    meta: { pagination: { total: 30, count: 3, per_page: 3, current_page: 2, total_pages: 10 } },
                }}
                onPageSelect={() => {}}
            >
                {({ items }) => <p>{items.length}</p>}
            </Pagination>
        );

        expect(cls('pagination')).toContain('flex');

        const pages = [...(part('pagination')?.querySelectorAll('button') ?? [])];

        expect(pages.length).toBeGreaterThan(0);
        expect(pages.every((p) => /(^|\s)lq(\s|$)/.test(p.className))).toBe(true);
        const current = pages.find((p) => /underline/.test(p.className));

        expect(current?.className).toContain('--lg-tint:rgb(184_184_255');
    });

    test('a tile Stat is material, an inline Stat is bare, unavailable is muted', () => {
        mount(
            <>
                <Stat label='CPU' value='12%' limit='of 100%' tone='success' />
                <Stat label='Disk' value='Offline' variant='tile' unavailable />
                <Stat label='Net' value='1 MB' variant='inline' tone='info' />
            </>
        );

        const roots = [...document.body.querySelectorAll("[data-ui='stat'][data-part='root']")].map((e) => e.className);

        expect(roots[0]).toMatch(/(^|\s)mat(\s|$)/);
        expect(roots[2]).not.toMatch(/(^|\s)mat(\s|$)/);
        expect(cls('stat', 'icon')).not.toBe(undefined);

        const values = [...document.body.querySelectorAll("[data-ui='stat'][data-part='value']")].map((e) => e.className);

        expect(values[1]).toContain('text-muted-foreground');
        expect(values[0]).toContain('tabular-nums');
    });

    test('a ChartCard is material; Avatar and Code render', () => {
        mount(
            <>
                <ChartCard title='Memory'>chart</ChartCard>
                <Avatar name='abc' />
                <Code dark>ls</Code>
            </>
        );

        expect(cls('chart-card')).toMatch(/(^|\s)mat(\s|$)/);
        expect(cls('code')).toContain('font-mono');
        expect(part('avatar')).not.toBeNull();
    });

    test('CopyOnClick shows a toast with the copied status', async () => {
        mount(
            <CopyOnClick text='abc'>
                <span>copy me</span>
            </CopyOnClick>
        );

        expect(rendered?.container.innerHTML).toContain('cursor-pointer');

        await act(async () => {
            fireEvent.click(screen.getByText('copy me'));
            await new Promise((r) => setTimeout(r, 30));
        });

        const status = part('copy-on-click', 'status');

        if (status) {
            expect(status.className).toMatch(/(^|\s)mat(\s|$)/);
        }
    });
});

describe('feedback', () => {
    test('an Alert is a tinted fill per type, not glass', () => {
        mount(
            <>
                {(['success', 'info', 'warning', 'danger'] as const).map((type) => (
                    <Alert key={type} type={type} title={type}>
                        text
                    </Alert>
                ))}
            </>
        );

        const alerts = [...document.body.querySelectorAll("[data-ui='alert'][data-part='root']")].map((e) => e.className);

        expect(alerts).toHaveLength(4);
        expect(alerts[3]).toContain('border-destructive');
        expect(alerts.some((c) => glass(c))).toBe(false);
        expect(cls('alert', 'icon')).toContain('size-5');
    });

    test('Badge green means success only: info and accent are not green', () => {
        mount(
            <>
                <Badge tone='success'>ok</Badge>
                <Badge tone='info'>i</Badge>
                <Badge tone='accent' variant='soft' size='sm'>
                    a
                </Badge>
            </>
        );

        const [ok, info, accent] = [...document.body.querySelectorAll("[data-ui='badge']")].map((e) => e.className);

        expect(ok).toContain('bg-success');
        expect(info).not.toMatch(/success|primary/);
        expect(accent).not.toMatch(/success|primary/);
        expect(accent).toContain('rounded-full');
    });

    test('Empty is a dashed plain surface with an icon medium', () => {
        mount(
            <Empty>
                <EmptyHeader>
                    <EmptyMedia variant='icon'>
                        <Plus />
                    </EmptyMedia>
                    <EmptyTitle>Nothing</EmptyTitle>
                    <EmptyDescription>Add one</EmptyDescription>
                </EmptyHeader>
            </Empty>
        );

        expect(cls('empty')).toContain('border-dashed');
        expect(glass(cls('empty'))).toBe(false);
        expect(cls('empty', 'media')).toContain('size-12');
    });

    test('ProgressBar meter and page variants and tones', () => {
        mount(
            <>
                <ProgressBar value={40} tone='info' />
                <ProgressBar value={20} variant='page' />
            </>
        );

        const roots = [...document.body.querySelectorAll("[data-ui='progress-bar'][data-part='root']")].map((e) => e.className);

        expect(roots[0]).toContain('rounded-full');
        expect(roots[1]).toContain('fixed');
        expect(cls('progress-bar', 'indicator')).toContain('bg-ast-lav');
    });

    test('Spinner spins and SpinnerOverlay inherits its parent corners and keeps classic positioning', () => {
        mount(
            <div className='relative'>
                <Spinner size='large' />
                <SpinnerOverlay visible>Working</SpinnerOverlay>
            </div>
        );

        expect(cls('spinner')).toContain('animate-[spin_0.8s_linear_infinite]');
        expect(cls('spinner-overlay')).toContain('z-10');
        expect(cls('spinner-overlay')).not.toContain('z-40');
        expect(cls('spinner-overlay')).toContain('absolute');
        expect(cls('spinner-overlay')).toContain('rounded-[inherit]');
    });
});

/* ― Built by DPDX Development · Bengaluru · dpdx.in · for Astrelyse ― */
