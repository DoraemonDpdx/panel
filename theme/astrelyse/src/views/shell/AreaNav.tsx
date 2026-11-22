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

import { NamedIcon } from '@pterodactyl/sdk';
import { Navigation, NavigationLink, Slot, type AccountArea, type AdminArea, type AppArea, type ServerArea } from '@pterodactyl/sdk/theme';

type Area = AccountArea | ServerArea | AdminArea;

/** Two letters for the server's avatar tile: "Survival SMP" is "SS". */
function initials(name: string): string {
    const words = name.trim().split(/\s+/).filter(Boolean);

    return ((words[0]?.[0] ?? '?') + (words.length > 1 ? (words[1]?.[0] ?? '') : (words[0]?.[1] ?? ''))).toUpperCase();
}

/** The slots of the area's navigation, which its own layout would render if it drew the navigation. */
function AreaSlot({ area, at }: { area: Area; at: 'before' | 'after' }) {
    if (area.kind === 'server') return <Slot name={`server.navigation.${at}`} data={area.server} />;
    if (area.kind === 'account') return <Slot name={`account.navigation.${at}`} />;

    return <Slot name={`panel.navigation.${at}`} />;
}

/** The pages of the area the user is in: a server's, the account's or the admin area's. */
export default function AreaNav({ area }: { area: AppArea }) {
    if (area.kind === 'dashboard') return null;

    const items = area.kind === 'server' && area.adminLink ? [...area.nav.items, area.adminLink] : area.nav.items;
    const label = { server: 'Server', account: 'Account', admin: 'Administration' }[area.kind];

    return (
        <nav aria-label={label} className='sh-area'>
            {area.kind === 'server' ? (
                <div className='sh-server' title={area.name}>
                    <span className='sh-server-av' data-state={area.state ?? 'unknown'} aria-hidden>
                        {initials(area.name)}
                    </span>
                    <span className='sh-label min-w-0 flex-1'>
                        <span className='sh-server-name'>{area.name}</span>
                        <span className='sh-server-state' data-state={area.state ?? 'unknown'}>
                            <i aria-hidden />
                            {area.state ?? 'unknown'}
                        </span>
                    </span>
                </div>
            ) : (
                <p className='sh-eyebrow sh-label'>{label}</p>
            )}
            <AreaSlot area={area} at='before' />
            <Navigation items={items}>
                {(item, { badge }) => (
                    <NavigationLink item={item} className='sh-link sh-menu-link' title={item.label}>
                        <span className='sh-ico'>{item.icon && <NamedIcon name={item.icon} size={16} aria-hidden />}</span>
                        <span className='sh-label min-w-0 flex-1 truncate'>{item.label}</span>
                        <span className='sh-label'>{badge}</span>
                    </NavigationLink>
                )}
            </Navigation>
            <AreaSlot area={area} at='after' />
        </nav>
    );
}

/* ― Built by DPDX Development · Bengaluru · dpdx.in · for Astrelyse ― */
