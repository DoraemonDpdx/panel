import React, { createContext, useContext } from 'react';
import { Tabs as BaseTabs } from '@base-ui/react/tabs';
import { useSkin } from '@/themes/skins';

export type TabsOrientation = 'horizontal' | 'vertical';

const OrientationContext = createContext<TabsOrientation>('horizontal');

export interface TabsProps {
    /** The selected tab's value, when controlled. */
    value?: string;
    defaultValue?: string;
    onValueChange?: (value: string) => void;
    orientation?: TabsOrientation;
    className?: string;
    children?: React.ReactNode;
}

/**
 * Tabs: one tab stop for the list (roving tabindex), arrow keys, Home and End move between tabs, and
 * each tab is tied to its panel with `aria-controls` / `aria-labelledby`. Built on Base UI's Tabs.
 *
 * ```tsx
 * <Tabs defaultValue='a'>
 *   <Tabs.List aria-label='Sections'><Tabs.Tab value='a'>A</Tabs.Tab><Tabs.Tab value='b'>B</Tabs.Tab></Tabs.List>
 *   <Tabs.Panel value='a'>…</Tabs.Panel><Tabs.Panel value='b'>…</Tabs.Panel>
 * </Tabs>
 * ```
 */
function TabsRoot({ orientation = 'horizontal', className, ...props }: TabsProps) {
    const ui = useSkin('Tabs', { orientation });

    return (
        <OrientationContext.Provider value={orientation}>
            <BaseTabs.Root orientation={orientation} {...props} {...ui('root', className)} />
        </OrientationContext.Provider>
    );
}

function TabsList({
    className,
    children,
    ...props
}: { className?: string; children?: React.ReactNode } & React.AriaAttributes) {
    const ui = useSkin('Tabs', { orientation: useContext(OrientationContext) });

    return (
        <BaseTabs.List {...props} {...ui('list', className)}>
            {children}
        </BaseTabs.List>
    );
}

function TabsTab({
    value,
    disabled,
    className,
    children,
}: {
    value: string;
    disabled?: boolean;
    className?: string;
    children?: React.ReactNode;
}) {
    const ui = useSkin('Tabs', { orientation: useContext(OrientationContext) });

    return (
        <BaseTabs.Tab
            value={value}
            disabled={disabled}
            {...ui('tab', className)}
            // Base UI marks the current tab with `data-active`; the skins (classic and theme) style
            // `data-selected`, so mirror it here rather than chase the attribute in every skin.
            render={(props, state) => <button {...props} data-selected={state.active ? '' : undefined} />}
        >
            {children}
        </BaseTabs.Tab>
    );
}

function TabsPanel({
    value,
    className,
    keepMounted,
    children,
}: {
    value: string;
    className?: string;
    keepMounted?: boolean;
    children?: React.ReactNode;
}) {
    const ui = useSkin('Tabs', { orientation: useContext(OrientationContext) });

    return (
        <BaseTabs.Panel value={value} keepMounted={keepMounted} {...ui('panel', className)}>
            {children}
        </BaseTabs.Panel>
    );
}

const Tabs = Object.assign(TabsRoot, { List: TabsList, Tab: TabsTab, Panel: TabsPanel });

export default Tabs;
