/** @vitest-environment jsdom */

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import Breadcrumb from './Breadcrumb';

afterEach(cleanup);

describe('Breadcrumb', () => {
    const items = [
        { label: 'Servers', href: '/servers' },
        { label: 'Survival', href: '/server/1' },
        { label: 'Settings' },
    ];

    it('is a named landmark with the last item as the current page', () => {
        render(<Breadcrumb items={items} />);

        const nav = screen.getByRole('navigation', { name: 'Breadcrumb' });

        expect(nav.querySelectorAll('li')).toHaveLength(3);
        expect(screen.getByRole('link', { name: 'Servers' })).toHaveAttribute('href', '/servers');
        expect(screen.getByText('Settings')).toHaveAttribute('aria-current', 'page');
        expect(screen.queryByRole('link', { name: 'Settings' })).not.toBeInTheDocument();
    });

    it('hides the separators from assistive technology', () => {
        const { container } = render(<Breadcrumb items={items} label='You are here' />);

        const separators = container.querySelectorAll('[data-part="separator"]');

        expect(separators).toHaveLength(2);
        for (const separator of separators) {
            expect(separator).toHaveAttribute('aria-hidden', 'true');
        }

        expect(screen.getByRole('navigation', { name: 'You are here' })).toBeInTheDocument();
    });

    it('lets an item render its link with the router', () => {
        render(
            <Breadcrumb
                items={[
                    { label: 'Home', render: ({ children, ...props }) => <button {...props}>{children}</button> },
                    { label: 'Here' },
                ]}
            />
        );

        expect(screen.getByRole('button', { name: 'Home' })).toHaveAttribute('data-part', 'link');
    });
});
