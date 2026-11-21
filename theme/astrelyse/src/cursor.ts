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

// Liquid glass mouse pointer, ported from the site's components/cursor/LiquidCursor.tsx.
//   - A clear glass arrow that refracts the page behind it (Chromium: SVG filter in backdrop-filter), with real
//     per-channel dispersion. Other browsers, or the "Refraction lens" setting off, keep a frosted pane.
//   - Flat and still at rest. It only tilts (and shows its glass sides) while the pointer moves, so nothing moves by
//     itself (PANEL_DESIGN.md: the user is in control). The tip tracks the real pointer exactly, with no lag.
//   - Fine pointers only. Over text fields the native I-beam comes back.
// Styles: styles/cursor.css. Never put mix-blend-mode on any layer of the cursor: in Chromium a blend-mode sibling
// isolates the group, which cuts the glass off from the page and silently disables the lens.

const NS = 'http://www.w3.org/2000/svg';
const SIZE = 40; // rendered px; the shape is authored in a 32-unit box
const SLABS = 9;
const LENS = 88; // displacement scale in px
const TEXT_SEL =
    'input:not([type=button]):not([type=submit]):not([type=reset]):not([type=checkbox]):not([type=radio]):not([type=range]):not([type=color]):not([type=file]),textarea,[contenteditable=""],[contenteditable="true"],.cm-content,.xterm-helper-textarea';
const HOT_SEL = 'a[href],button,[role="button"],[role="menuitem"],[role="tab"],[role="option"],label,select,summary,[data-cursor="hot"]';

// The glass is every point within R of this core polygon (the arrow outline shrunk by R). The bevel lives only in that
// rounded band, whose distance field has no corners, so the surface has no ridges (a bevel reaching into the core makes
// ridges from each corner to the middle, which the lens draws as three converging lines).
const CORE: [number, number][] = [
    [9.3, 9.3],
    [20.5, 13.5],
    [15.8, 15.5],
    [13.5, 20.5],
];
const R = 3.3;
const BEZEL = 3.3;
const CENTER = [13.2, 13.2]; // optical centre for the interior magnification

const clamp = (v: number, m: number) => (v > m ? m : v < -m ? -m : v);

/** Displacement map: rim refraction from the slope of a smooth glass surface, plus a smooth interior magnification and a gentle ripple. */
function arrowLensMap(px: number): string {
    const k = 32 / px;
    const inPoly = (x: number, y: number) => {
        let inside = false;
        for (let i = 0, j = CORE.length - 1; i < CORE.length; j = i++) {
            const [xi, yi] = CORE[i];
            const [xj, yj] = CORE[j];
            if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
        }
        return inside;
    };
    // 1. height: 0 outside the glass, rising over the bevel, flat on top
    const h = new Float32Array(px * px);
    for (let y = 0; y < px; y++) {
        for (let x = 0; x < px; x++) {
            const ux = (x + 0.5) * k;
            const uy = (y + 0.5) * k;
            let best = Infinity;
            for (let a = 0; a < CORE.length; a++) {
                const [ax, ay] = CORE[a];
                const [bx, by] = CORE[(a + 1) % CORE.length];
                const ex = bx - ax;
                const ey = by - ay;
                const t = Math.max(0, Math.min(1, ((ux - ax) * ex + (uy - ay) * ey) / (ex * ex + ey * ey)));
                best = Math.min(best, Math.hypot(ux - ax - ex * t, uy - ay - ey * t));
            }
            const inside = inPoly(ux, uy) ? R + best : R - best;
            if (inside <= 0) continue;
            const t = Math.min(inside / BEZEL, 1);
            h[y * px + x] = 1 - Math.pow(1 - t, 2.4);
        }
    }
    // 2. soften the surface a little (3 box-blur passes ~ gaussian)
    const rad = Math.max(1, Math.round(px / 32));
    const tmp = new Float32Array(px * px);
    for (let pass = 0; pass < 3; pass++) {
        for (let y = 0; y < px; y++)
            for (let x = 0; x < px; x++) {
                let sum = 0;
                let n = 0;
                for (let d = -rad; d <= rad; d++) {
                    const xx = x + d;
                    if (xx >= 0 && xx < px) {
                        sum += h[y * px + xx];
                        n++;
                    }
                }
                tmp[y * px + x] = sum / n;
            }
        for (let y = 0; y < px; y++)
            for (let x = 0; x < px; x++) {
                let sum = 0;
                let n = 0;
                for (let d = -rad; d <= rad; d++) {
                    const yy = y + d;
                    if (yy >= 0 && yy < px) {
                        sum += tmp[yy * px + x];
                        n++;
                    }
                }
                h[y * px + x] = sum / n;
            }
    }
    // 3. slope of the surface: light is pulled toward the thicker glass
    const gx = new Float32Array(px * px);
    const gy = new Float32Array(px * px);
    let max = 1e-6;
    const H = (x: number, y: number) => h[Math.min(px - 1, Math.max(0, y)) * px + Math.min(px - 1, Math.max(0, x))];
    for (let y = 0; y < px; y++)
        for (let x = 0; x < px; x++) {
            const i = y * px + x;
            gx[i] = (H(x + 1, y) - H(x - 1, y)) / 2;
            gy[i] = (H(x, y + 1) - H(x, y - 1)) / 2;
            max = Math.max(max, Math.hypot(gx[i], gy[i]));
        }
    const c = document.createElement('canvas');
    c.width = c.height = px;
    const ctx = c.getContext('2d');
    if (!ctx) return '';
    const img = ctx.createImageData(px, px);
    const d = img.data;
    // 4. interior: smooth magnification toward the optical centre plus a gentle ripple, faded in by the height
    for (let y = 0, i = 0, j = 0; y < px; y++) {
        for (let x = 0; x < px; x++, i++, j += 4) {
            const ux = (x + 0.5) * k;
            const uy = (y + 0.5) * k;
            const w = h[i];
            const mx = ((CENTER[0] - ux) / 12) * 0.45 * w;
            const my = ((CENTER[1] - uy) / 12) * 0.45 * w;
            const wx = Math.sin(uy * 0.55 + ux * 0.18) * 0.09 * w;
            const wy = Math.sin(ux * 0.55 - uy * 0.2) * 0.09 * w;
            const dx = Math.max(-1, Math.min(1, (gx[i] / max) * 0.8 + mx + wx));
            const dy = Math.max(-1, Math.min(1, (gy[i] / max) * 0.8 + my + wy));
            d[j] = 128 + dx * 127;
            d[j + 1] = 128 + dy * 127;
            d[j + 2] = 128;
            d[j + 3] = 255;
        }
    }
    ctx.putImageData(img, 0, 0);
    return c.toDataURL();
}

const svgEl = <K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string | number>, parent: Element) => {
    const e = document.createElementNS(NS, tag);
    for (const a in attrs) e.setAttribute(a, String(attrs[a]));
    parent.appendChild(e);
    return e;
};

/** Refraction filter: the backdrop bent once per colour channel, each a little differently (real dispersion). */
function buildLens(target: HTMLElement) {
    const svg = svgEl('svg', { 'aria-hidden': 'true', style: 'position:absolute;width:0;height:0;pointer-events:none' }, document.body);
    const f = svgEl('filter', { id: 'ast-cursor-lens', x: 0, y: 0, width: '100%', height: '100%', 'color-interpolation-filters': 'sRGB' }, svg);
    svgEl('feImage', { href: arrowLensMap(SIZE * 2), x: 0, y: 0, width: SIZE, height: SIZE, preserveAspectRatio: 'none', result: 'map' }, f);
    svgEl('feGaussianBlur', { in: 'SourceGraphic', stdDeviation: 0.25, result: 'src' }, f);
    const iso = ['1 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1 0', '0 0 0 0 0  0 1 0 0 0  0 0 0 0 0  0 0 0 1 0', '0 0 0 0 0  0 0 0 0 0  0 0 1 0 0  0 0 0 1 0'];
    const disp = iso.map((m, i) => {
        const dm = svgEl('feDisplacementMap', { in: 'src', in2: 'map', scale: LENS, xChannelSelector: 'R', yChannelSelector: 'G' }, f);
        svgEl('feColorMatrix', { type: 'matrix', values: m, result: `c${i}` }, f);
        return dm;
    });
    svgEl('feBlend', { in: 'c0', in2: 'c1', mode: 'screen', result: 'rg' }, f);
    svgEl('feBlend', { in: 'rg', in2: 'c2', mode: 'screen' }, f);
    const css = 'url(#ast-cursor-lens) brightness(1.04)';
    let on = false;
    let last = -1;
    return {
        /** Follows the theme's "Refraction lens" setting (data-ast-lens on <html>). */
        sync(enabled: boolean) {
            if (enabled === on) return;
            on = enabled;
            if (enabled) {
                target.style.setProperty('backdrop-filter', css);
                target.style.setProperty('-webkit-backdrop-filter', css);
            } else {
                target.style.removeProperty('backdrop-filter');
                target.style.removeProperty('-webkit-backdrop-filter');
            }
        },
        /** spread 0..1: how far apart the R, G, B refractions sit */
        spread(s: number) {
            const sp = Math.round((0.05 + s * 0.22) * 100) / 100;
            if (sp === last) return;
            last = sp;
            disp.forEach((dm, i) => dm.setAttribute('scale', String(LENS * (1 - sp + i * sp))));
        },
    };
}

function markup(): HTMLDivElement {
    const el = document.createElement('div');
    el.className = 'ast-cursor';
    el.setAttribute('aria-hidden', 'true');
    const tilt = document.createElement('div');
    tilt.className = 'ast-cursor__tilt';
    const layer = (cls: string, vars?: Record<string, number>) => {
        const i = document.createElement('i');
        i.className = cls;
        if (vars) for (const k in vars) i.style.setProperty(k, String(vars[k]));
        tilt.appendChild(i);
    };
    layer('ast-cursor__back', { '--n': SLABS });
    for (let i = 0; i < SLABS; i++) layer('ast-cursor__slab', { '--i': SLABS - i });
    layer('ast-cursor__body');
    layer('ast-cursor__sheen');
    layer('ast-cursor__rim');
    tilt.insertAdjacentHTML(
        'beforeend',
        `<svg class="ast-cursor__spec" viewBox="0 0 32 32" width="${SIZE}" height="${SIZE}">` +
            '<defs><linearGradient id="ast-cursor-spec-a" x1="0" y1="0" x2="1" y2="0.4"><stop offset="0" stop-color="#fff"/><stop offset="0.7" stop-color="#fff" stop-opacity=".25"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>' +
            '<linearGradient id="ast-cursor-spec-b" x1="0" y1="0" x2="0.4" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".9"/><stop offset="0.6" stop-color="#b8b8ff" stop-opacity=".2"/><stop offset="1" stop-color="#b8b8ff" stop-opacity="0"/></linearGradient></defs>' +
            '<path d="M5.6 4.6L26.6 12.4" stroke="url(#ast-cursor-spec-a)" stroke-width=".9" stroke-linecap="round" fill="none"/>' +
            '<path d="M4.6 5.6L12.6 26.4" stroke="url(#ast-cursor-spec-b)" stroke-width=".8" stroke-linecap="round" fill="none"/></svg>'
    );
    el.appendChild(tilt);
    return el;
}

let started = false;

/** Starts the glass cursor for the whole document. Safe to call more than once; does nothing on touch-only devices. */
export function startCursor(): void {
    if (started || typeof document === 'undefined' || typeof matchMedia !== 'function') return;
    if (!document.body) {
        document.addEventListener('DOMContentLoaded', startCursor, { once: true });
        return;
    }
    if (!matchMedia('(hover: hover) and (pointer: fine)').matches) return;
    started = true;

    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const root = document.documentElement;
    const el = markup();
    const tl = el.firstElementChild as HTMLElement;
    document.body.appendChild(el);
    root.classList.add('ast-cursor-on');

    const chromium = /Chrome\//.test(navigator.userAgent);
    const opaque = matchMedia('(prefers-reduced-transparency: reduce)').matches;
    const lens = chromium && !opaque ? buildLens(el.querySelector<HTMLElement>('.ast-cursor__body')!) : null;
    const syncLens = () => lens?.sync(root.dataset.astLens !== 'false');
    syncLens();
    if (lens) new MutationObserver(syncLens).observe(root, { attributes: true, attributeFilter: ['data-ast-lens'] });

    let x = -100;
    let y = -100;
    let px = x;
    let py = y;
    let vx = 0;
    let vy = 0;
    let rx = 0;
    let ry = 0;
    let rz = 0;
    let a = 135;
    let s = 1;
    let sv = 0;
    let down = false;
    let hot = false;
    let raf = 0;
    let still = 0;

    const loop = () => {
        const dx = x - px;
        const dy = y - py;
        px = x;
        py = y;
        vx += (dx - vx) * 0.3;
        vy += (dy - vy) * 0.3;

        const k = reduce ? 0 : 1;
        rx += (clamp(-vy * 1.6, 30) * k - rx) * 0.16;
        ry += (clamp(vx * 1.6, 30) * k - ry) * 0.16;
        rz += (clamp(vx * 0.45, 12) * k - rz) * 0.14;
        a += (vx - vy) * 1.1 * k;

        // press 80 ms-ish squish, short release spring (PANEL_DESIGN.md timings)
        const target = down ? 0.86 : hot ? 1.12 : 1;
        sv = (sv + (target - s) * 0.3) * 0.62;
        s += sv;

        el.style.transform = `translate3d(${x}px,${y}px,0)`;
        tl.style.transform = `rotateX(${rx.toFixed(2)}deg) rotateY(${ry.toFixed(2)}deg) rotateZ(${rz.toFixed(2)}deg) scale(${s.toFixed(4)})`;
        el.style.setProperty('--a', `${a.toFixed(1)}deg`);
        const tw = Math.min(1, (Math.abs(rx) + Math.abs(ry)) / 26);
        el.style.setProperty('--tw', tw.toFixed(3));
        el.style.setProperty('--spec', (0.75 + clamp((ry - rx) / 50, 0.25)).toFixed(3));
        lens?.spread(tw);

        const settled = Math.abs(vx) + Math.abs(vy) + Math.abs(rx) + Math.abs(ry) + Math.abs(sv) + Math.abs(target - s) < 0.02;
        still = settled ? still + 1 : 0;
        raf = still > 4 ? 0 : requestAnimationFrame(loop);
    };
    const kick = () => {
        if (!raf) {
            still = 0;
            raf = requestAnimationFrame(loop);
        }
    };

    addEventListener(
        'pointermove',
        (e) => {
            if (e.pointerType !== 'mouse') return;
            x = e.clientX;
            y = e.clientY;
            if (el.dataset.show !== '1') {
                px = x;
                py = y;
                el.dataset.show = '1';
            }
            const t = e.target instanceof Element ? e.target : null;
            const isText = !!t?.closest(TEXT_SEL);
            hot = !isText && !!t?.closest(HOT_SEL);
            const mode = isText ? 'text' : hot ? 'hot' : '';
            if (el.dataset.mode !== mode) el.dataset.mode = mode;
            kick();
        },
        { passive: true }
    );
    addEventListener(
        'pointerdown',
        (e) => {
            if (e.pointerType !== 'mouse') return;
            down = true;
            kick();
        },
        { passive: true }
    );
    addEventListener(
        'pointerup',
        () => {
            down = false;
            kick();
        },
        { passive: true }
    );
    const hide = () => {
        el.dataset.show = '0';
    };
    addEventListener('blur', hide);
    root.addEventListener('mouseleave', hide);
}

/* ― Built by DPDX Development · Bengaluru · dpdx.in · for Astrelyse ― */
