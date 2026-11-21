import type { CSSProperties, ReactElement } from 'react';
import blue from './recaptcha-blue.png?url';
import grey from './recaptcha-grey.png?url';
import navy from './recaptcha-navy.png?url';
import PaintImpl from './MetallicPaint';

// MetallicPaint is vendored untyped; treat every prop as optional.
const MetallicPaint = PaintImpl as unknown as (props: Record<string, unknown>) => ReactElement;

const LIQUID = { density: 2.2, dispersion: 0.35, distortion: 0.18, edgeBend: 0.9 };
const FILL: CSSProperties = { position: 'absolute', inset: 0 };

/** The reCAPTCHA mark as liquid metal: each arrow keeps its own colour, as in Google's logo. Fills its parent. */
export default function RecaptchaMark({ className }: { className?: string }) {
    const shared = { ...LIQUID, style: FILL, scale: 0.98, intro: true };

    return (
        <div className={className} style={{ position: 'relative', width: '100%', height: '100%' }}>
            <MetallicPaint {...shared} imageSrc={grey} color='#b9bdc8' />
            <MetallicPaint {...shared} imageSrc={blue} color='#4285f4' />
            <MetallicPaint {...shared} imageSrc={navy} color='#1c3aa9' />
        </div>
    );
}
