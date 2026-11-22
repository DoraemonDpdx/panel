import type { CSSProperties, ReactElement } from 'react';
import dot from './logo-dot.svg?url';
import mark from './logo-mark.svg?url';
import star from './logo-star.svg?url';
import PaintImpl from './MetallicPaint';

// MetallicPaint is vendored untyped; treat every prop as optional.
const MetallicPaint = PaintImpl as unknown as (props: Record<string, unknown>) => ReactElement;

const LIQUID = { density: 2.6, dispersion: 0.45, distortion: 0.22, edgeBend: 0.92 };
const FILL: CSSProperties = { position: 'absolute', inset: 0 };

/** The Astrelyse mark in the website's "Liquid" metallic preset: blue arcs, lavender star, green node. Fills its parent. */
export default function MetallicLogo({ className }: { className?: string }) {
    const shared = { ...LIQUID, style: FILL, scale: 0.95, intro: true };

    return (
        <div className={className} style={{ position: 'relative', width: '100%', height: '100%' }}>
            <MetallicPaint {...shared} imageSrc={mark} color='#0c30bd' />
            <MetallicPaint {...shared} imageSrc={star} color='#B8B8FF' />
            <MetallicPaint {...shared} imageSrc={dot} color='#39FF14' />
        </div>
    );
}
