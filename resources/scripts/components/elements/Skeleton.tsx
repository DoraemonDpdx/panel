import { replaceable, useSkin } from '@/themes/skins';

/** `line` is a run of text; `block` a rectangle; `circle` an avatar or icon; `row`, `card` and `chart` are the containers of a loading list row, card or chart. */
export type SkeletonKind = 'line' | 'block' | 'circle' | 'row' | 'card' | 'chart';

export interface SkeletonProps {
    kind?: SkeletonKind;
    /** CSS width and height of a `line`, `block` or `circle`. */
    width?: string | number;
    height?: string | number;
    /** How many of a `row`, `card` or `chart`'s inner lines to draw. */
    lines?: number;
    /** Names the loading region for assistive technology. */
    label?: string;
    className?: string;
}

const DEFAULT_LINES = new Map<SkeletonKind, number>([
    ['row', 2],
    ['card', 3],
]);
const COMPOSITE = new Set<SkeletonKind>(['row', 'card', 'chart']);

/** A static placeholder kind: a plain fill, never a shimmer or a pulse. */
function CoreSkeleton({ kind = 'line', width, height, lines, label = 'Loading', className }: SkeletonProps) {
    const ui = useSkin('Skeleton', { kind });
    const composite = COMPOSITE.has(kind);
    const style = width !== undefined || height !== undefined ? { width, height } : undefined;

    if (!composite) {
        return <span {...ui('root', className)} style={style} aria-hidden />;
    }

    const count = lines ?? DEFAULT_LINES.get(kind) ?? 0;
    const piece = (key: string, pieceKind: SkeletonKind, extra?: string) => (
        <span key={key} {...ui('root', extra, { kind: pieceKind })} aria-hidden />
    );

    return (
        <div {...ui('root', className)} role='status' aria-busy='true' aria-label={label} style={style}>
            {kind === 'row' && (
                <>
                    {piece('icon', 'circle')}
                    <span {...ui('body')}>
                        {Array.from({ length: count }, (_, index) =>
                            piece(`line-${index}`, 'line', index === 0 ? 'w-2/5' : 'w-3/5')
                        )}
                    </span>
                </>
            )}
            {kind === 'card' && (
                <>
                    {piece('title', 'line', 'w-1/3')}
                    {Array.from({ length: count }, (_, index) =>
                        piece(`line-${index}`, 'line', index === count - 1 ? 'w-2/3' : 'w-full')
                    )}
                </>
            )}
            {kind === 'chart' && piece('plot', 'block', 'h-full w-full')}
        </div>
    );
}

const Skeleton = replaceable('Skeleton', CoreSkeleton);

export default Skeleton;
