import type { ReactNode } from 'react';
import { ExternalLink } from 'lucide-react';
import { Alert, Badge, Button, Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyTitle, Skeleton } from '@/sdk';

export const PROVIDER_NAMES = { modrinth: 'Modrinth', curseforge: 'CurseForge' } as const;

export function Thumb({ url, title }: { url: string | null; title: string }) {
    return url ? (
        <img src={url} alt='' className='size-10 shrink-0 rounded-sm object-cover' />
    ) : (
        <Badge variant='soft' className='size-10 shrink-0 justify-center text-base' aria-hidden>
            {title.charAt(0).toUpperCase()}
        </Badge>
    );
}

export function ExternalLinkText({ href, children }: { href: string; children: ReactNode }) {
    return (
        <a
            href={href}
            target='_blank'
            rel='noopener noreferrer'
            className='inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground'
        >
            {children}
            <ExternalLink className='size-3' aria-hidden />
        </a>
    );
}

export function Skeletons({ count }: { count: number }) {
    return (
        <div className='flex flex-col gap-2' aria-busy role='status' aria-label='Loading'>
            {Array.from({ length: count }, (_, index) => (
                <Skeleton key={index} kind='row' />
            ))}
        </div>
    );
}

/** An error in place, never the full-page illustration. */
export function InlineError({ message, retry }: { message: string; retry?: () => void }) {
    return (
        <div className='flex items-start gap-2'>
            <Alert type='danger' className='min-w-0 flex-1'>
                {message}
            </Alert>
            {retry && (
                <Button size='xsmall' isSecondary color='grey' onClick={retry}>
                    Retry
                </Button>
            )}
        </div>
    );
}

export function EmptyNote({ title, children, action }: { title: string; children?: ReactNode; action?: ReactNode }) {
    return (
        <Empty size='compact'>
            <EmptyHeader>
                <EmptyTitle>{title}</EmptyTitle>
                {children && <EmptyDescription>{children}</EmptyDescription>}
            </EmptyHeader>
            {action && <EmptyContent>{action}</EmptyContent>}
        </Empty>
    );
}
