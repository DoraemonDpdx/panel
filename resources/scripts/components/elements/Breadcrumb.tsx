import React from 'react';
import { replaceable, useSkin } from '@/themes/skins';

export interface BreadcrumbLinkProps {
    className: string | undefined;
    'data-ui': string;
    'data-part': string;
    children: React.ReactNode;
}

export interface BreadcrumbItem {
    label: React.ReactNode;
    /** Where the crumb links to; the last item is the current page and is never a link. */
    href?: string;
    /** Renders a crumb's link with the app's router; receives the props of the anchor it replaces. */
    render?: (props: BreadcrumbLinkProps) => React.ReactElement;
}

export interface BreadcrumbProps {
    items: readonly BreadcrumbItem[];
    /** Names the landmark. */
    label?: string;
    className?: string;
}

/** The path to the current page. The last item is `aria-current="page"`; separators are decoration. */
function CoreBreadcrumb({ items, label = 'Breadcrumb', className }: BreadcrumbProps) {
    const ui = useSkin('Breadcrumb', {});

    return (
        <nav aria-label={label} {...ui('root', className)}>
            <ol {...ui('list')}>
                {items.map((item, index) => {
                    const current = index === items.length - 1;
                    const key = `${index}`;
                    const link = ui('link');

                    return (
                        <li key={key} {...ui('item')}>
                            {current && (
                                <span {...ui('current')} aria-current='page'>
                                    {item.label}
                                </span>
                            )}
                            {!current && item.render?.({ ...link, children: item.label })}
                            {!current && !item.render && (
                                <a {...link} href={item.href}>
                                    {item.label}
                                </a>
                            )}
                            {!current && (
                                <span {...ui('separator')} aria-hidden>
                                    /
                                </span>
                            )}
                        </li>
                    );
                })}
            </ol>
        </nav>
    );
}

const Breadcrumb = replaceable('Breadcrumb', CoreBreadcrumb);

export default Breadcrumb;
