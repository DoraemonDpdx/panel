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

import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowLeft, ChevronsLeft, LogOut, Menu, Moon, Sun, UserRound } from 'lucide-react';
import {
    Avatar,
    DropdownMenu,
    Icon,
    NamedIcon,
    PanelLink,
    ShortcutsOverlay,
    SpinnerOverlay,
    cn,
    usePanelLocation,
} from '@pterodactyl/sdk';
import { Main, Slot, View, type AppLayoutModel, type ViewProps } from '@pterodactyl/sdk/theme';
import AreaNav from './AreaNav';

const schemeLabels = { dark: 'Dark', light: 'Light' } as const;
const STORE = 'astrelyse.menu.collapsed';
const WIDE = '(min-width: 64rem)';

function readCollapsed() {
    try {
        return window.localStorage.getItem(STORE) === '1';
    } catch {
        return false;
    }
}

/** Wide screens get a sidebar, narrower ones a drawer. */
function useWide() {
    const [wide, setWide] = useState(() => typeof window !== 'undefined' && !!window.matchMedia?.(WIDE).matches);

    useEffect(() => {
        const query = window.matchMedia?.(WIDE);
        if (!query) return;
        const update = () => setWide(query.matches);
        update();
        query.addEventListener?.('change', update);

        return () => query.removeEventListener?.('change', update);
    }, []);

    return wide;
}

function UserMenu({ model }: { model: AppLayoutModel }) {
    const account = model.links.find((link) => link.id === 'account');

    return (
        <DropdownMenu
            triggerClassName='sh-nav-user'
            triggerContent={
                <>
                    <span className='size-6 shrink-0 overflow-hidden rounded-full'>
                        <Avatar name={model.user.uuid} />
                    </span>
                    <span className='hidden max-w-32 truncate text-sm sm:inline'>{model.user.username}</span>
                    <span className='sr-only'>Account menu</span>
                </>
            }
        >
            {account && (
                <DropdownMenu.Item destination={account.destination} icon={UserRound}>
                    {account.label}
                </DropdownMenu.Item>
            )}
            {model.setScheme &&
                model.schemes.map((scheme) => (
                    <DropdownMenu.Item
                        key={scheme}
                        icon={scheme === 'light' ? Sun : Moon}
                        checked={scheme === model.preference}
                        onClick={() => model.setScheme?.(scheme)}
                    >
                        {schemeLabels[scheme]}
                    </DropdownMenu.Item>
                ))}
            <DropdownMenu.Item icon={LogOut} onClick={model.signOut}>
                Sign out
            </DropdownMenu.Item>
        </DropdownMenu>
    );
}

/** The menu: global links between their slots, then the current area's pages. */
function MenuContent({ model }: { model: AppLayoutModel }) {
    return (
        <>
            <nav aria-label='Main' className='sh-area'>
                <p className='sh-eyebrow sh-label'>Navigate</p>
                <Slot name='nav.items.before' />
                {model.links
                    .filter((link) => link.id !== 'account')
                    .map((link) => (
                        <PanelLink
                            key={link.id}
                            destination={link.destination}
                            exact={link.exact}
                            className='sh-link sh-menu-link'
                            title={link.label}
                        >
                            <span className='sh-ico'>
                                <NamedIcon name={link.icon} size={16} aria-hidden />
                            </span>
                            <span className='sh-label'>{link.label}</span>
                        </PanelLink>
                    ))}
                <Slot name='nav.items.after' />
            </nav>
            <AreaNav area={model.area} />
        </>
    );
}

/**
 * A slim global top bar, the same on every page (hamburger, brand, search, user), and one menu that holds all
 * navigation: a sidebar from lg up, a drawer below it.
 */
export default function AppLayout({ model, className, children }: ViewProps<'layout.app'>) {
    const wide = useWide();
    const [collapsed, setCollapsed] = useState(readCollapsed);
    const [drawer, setDrawer] = useState(false);
    const { pathname } = usePanelLocation();
    const menuRef = useRef<HTMLElement>(null);
    const buttonRef = useRef<HTMLButtonElement>(null);
    const open = wide || drawer;
    const rail = wide && collapsed;
    const accountLink = model.links.find((link) => link.id === 'account');
    const inServer = model.area.kind === 'server';

    // Each open or close settles the glass for a moment; a and b alternate so a quick second click restarts it.
    const [morph, setMorph] = useState<'a' | 'b' | undefined>();
    const morphTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
    useEffect(() => () => clearTimeout(morphTimer.current), []);

    const toggle = () => {
        setMorph((current) => (current === 'a' ? 'b' : 'a'));
        clearTimeout(morphTimer.current);
        morphTimer.current = setTimeout(() => setMorph(undefined), 800);
        if (wide) {
            const next = !collapsed;
            setCollapsed(next);
            try {
                window.localStorage.setItem(STORE, next ? '1' : '0');
            } catch {
                /* a private window keeps it for this visit only */
            }
        } else {
            setDrawer(!drawer);
        }
    };

    const closeDrawer = useCallback(() => {
        setDrawer(false);
        buttonRef.current?.focus();
    }, []);

    // "[" folds the sidebar to an icon rail (or opens the drawer), like most editors. Never while typing.
    useEffect(() => {
        const onKey = (event: KeyboardEvent) => {
            const target = event.target as HTMLElement | null;
            if (event.key !== '[' || event.metaKey || event.ctrlKey || event.altKey) return;
            if (target?.closest('input, textarea, select, [contenteditable="true"], .cm-editor, .xterm')) return;
            buttonRef.current?.click();
        };
        document.addEventListener('keydown', onKey);

        return () => document.removeEventListener('keydown', onKey);
    }, []);

    // Following a link closes the drawer.
    useEffect(() => setDrawer(false), [pathname]);

    // Drawer only: the page underneath does not scroll while it is open. Restored on close.
    useEffect(() => {
        if (wide || !drawer) return;
        const html = document.documentElement;
        const previous = html.style.overflow;
        html.style.overflow = 'hidden';

        return () => {
            html.style.overflow = previous;
        };
    }, [wide, drawer]);

    // Drawer only: Escape closes it, and Tab stays inside it. Focus moves in when it opens.
    useEffect(() => {
        if (wide || !drawer) return;
        const menu = menuRef.current;
        const focusable = () => [...(menu?.querySelectorAll<HTMLElement>('a[href], button:not([disabled])') ?? [])];
        focusable()[0]?.focus();

        const onKey = (event: KeyboardEvent) => {
            if (event.key === 'Escape') return closeDrawer();
            if (event.key !== 'Tab') return;
            const items = focusable();
            const first = items[0];
            const last = items[items.length - 1];
            if (!first || !last) return;
            if (event.shiftKey && document.activeElement === first) {
                event.preventDefault();
                last.focus();
            } else if (!event.shiftKey && document.activeElement === last) {
                event.preventDefault();
                first.focus();
            }
        };
        document.addEventListener('keydown', onKey);

        return () => document.removeEventListener('keydown', onKey);
    }, [wide, drawer, closeDrawer]);

    return (
        <div className={cn('sh-app', className)}>
            <SpinnerOverlay visible={model.signingOut} fixed />
            <ShortcutsOverlay />
            <header className='lq lq-nav sh-nav-wrap sh-nav'>
                {inServer && (
                    <PanelLink destination={{ to: '/' }} className='sh-link sh-back' title='Back to all servers'>
                        <Icon icon={ArrowLeft} aria-hidden />
                        <span className='sh-back-label'>Servers</span>
                    </PanelLink>
                )}
                <button
                    ref={buttonRef}
                    type='button'
                    className='sh-link sh-burger'
                    aria-expanded={open && !rail}
                    aria-controls='sh-menu'
                    aria-label='Menu'
                    onClick={toggle}
                >
                    <Icon icon={Menu} aria-hidden />
                </button>
                <PanelLink destination={{ to: '/' }} className='sh-brand'>
                    {model.brand.logoUrl ? (
                        <img src={model.brand.logoUrl} alt={model.brand.name} className='h-7 w-auto' />
                    ) : (
                        <span className='font-header text-xl'>{model.brand.name}</span>
                    )}
                </PanelLink>
                <div className='sh-tools'>
                    <View name='app.search' className='sh-link' />
                    <UserMenu model={model} />
                </div>
            </header>
            <div className='sh-offset' aria-hidden />
            {!wide && open && (
                <button type='button' tabIndex={-1} aria-hidden className='sh-scrim' onClick={closeDrawer} />
            )}
            <div className='sh-body' data-wide={wide || undefined} data-rail={rail || undefined} data-morph={morph}>
                <aside id='sh-menu' ref={menuRef} aria-label='Menu' hidden={!open} className='lq lq-nav sh-menu'
                    data-lens='large'>
                    <div className='sh-menu-scroll'>
                        <MenuContent model={model} />
                    </div>
                    <div className='sh-foot'>
                        {accountLink && (
                            <PanelLink
                                destination={accountLink.destination}
                                exact={accountLink.exact}
                                className='sh-link sh-menu-link'
                                title={accountLink.label}
                            >
                                <span className='sh-ico'>
                                    <NamedIcon name={accountLink.icon} size={16} aria-hidden />
                                </span>
                                <span className='sh-label'>{accountLink.label}</span>
                            </PanelLink>
                        )}
                        {wide && (
                            <button
                                type='button'
                                className='sh-link sh-collapse'
                                onClick={toggle}
                                title={rail ? 'Expand sidebar ([)' : 'Collapse sidebar ([)'}
                            >
                                <span className='sh-ico'>
                                    <Icon icon={ChevronsLeft} aria-hidden />
                                </span>
                                <span className='sh-label'>Collapse</span>
                                <kbd className='sh-label sh-kbd'>[</kbd>
                            </button>
                        )}
                    </div>
                </aside>
                <div className='sh-page'>
                    <Main>{children}</Main>
                </div>
            </div>
        </div>
    );
}

/* ― Built by DPDX Development · Bengaluru · dpdx.in · for Astrelyse ― */
