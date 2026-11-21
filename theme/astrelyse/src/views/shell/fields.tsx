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

import { useId } from 'react';
import { Input, Label, type FieldModel } from '@pterodactyl/sdk';

/** Label, input and help text for an engine field; the field's own props pass through untouched. */
export function TextField({
    field,
    label,
    description,
    title,
    autoFocus,
}: {
    field: FieldModel;
    label?: string;
    description?: string;
    title?: string;
    autoFocus?: boolean;
}) {
    const id = useId();
    const helpId = `${id}-help`;
    const help = field.error ?? description;

    return (
        <div>
            {(label ?? title) && <Label htmlFor={id}>{label ?? title}</Label>}
            <Input
                {...field.fieldProps}
                id={id}
                autoFocus={autoFocus}
                aria-invalid={field.error ? true : undefined}
                aria-describedby={help ? helpId : undefined}
                $hasError={!!field.error}
            />
            {help && (
                <p id={helpId} className={field.error ? 'input-help error' : 'input-help'}>
                    {help}
                </p>
            )}
        </div>
    );
}

/* ― Built by DPDX Development · Bengaluru · dpdx.in · for Astrelyse ― */
