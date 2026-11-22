import { useId, useState } from 'react';
import { Button, Skeleton } from '@/sdk';
import type { ModProjectDetail } from '@/sdk/theme';
import { ExternalLinkText } from './parts';

/** Past this many characters the description is clipped, with a "Read more". */
const CLIP = 320;

/** The description is text from a remote source: it is rendered as characters, never as markup. */
function Description({ text }: { text: string }) {
    const id = useId();
    const [open, setOpen] = useState(false);
    const long = text.length > CLIP;

    return (
        <section aria-label='About this project' className='flex flex-col items-start gap-1'>
            <p
                id={id}
                className={`w-full text-sm break-words whitespace-pre-wrap text-muted-foreground ${open ? '' : 'line-clamp-6'}`}
            >
                {text}
            </p>
            {long && (
                <Button.Text size='xsmall' aria-expanded={open} aria-controls={id} onClick={() => setOpen(!open)}>
                    {open ? 'Show less' : 'Read more'}
                </Button.Text>
            )}
        </section>
    );
}

/** The drawer's project view: screenshots, a description and links, between the header and the versions. */
export default function ProjectDetail({ detail }: { detail: ModProjectDetail }) {
    if (detail.loading) {
        return <Skeleton kind='row' />;
    }

    if (detail.description === null && detail.gallery.length === 0 && detail.links.length === 0) {
        return null;
    }

    return (
        <div className='flex min-w-0 flex-col gap-3'>
            {detail.gallery.length > 0 && (
                <ul aria-label='Screenshots' className='grid grid-cols-2 gap-2 sm:grid-cols-4'>
                    {detail.gallery.map((image) => (
                        <li key={image.url} className='min-w-0'>
                            <img
                                src={image.url}
                                alt={image.title}
                                loading='lazy'
                                className='aspect-video w-full rounded-sm bg-card object-cover'
                            />
                        </li>
                    ))}
                </ul>
            )}
            {detail.description !== null && <Description text={detail.description} />}
            {detail.links.length > 0 && (
                <ul aria-label='Links' className='flex flex-wrap gap-x-4 gap-y-1'>
                    {detail.links.map((link) => (
                        <li key={link.label}>
                            <ExternalLinkText href={link.url}>{link.label}</ExternalLinkText>
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
}
