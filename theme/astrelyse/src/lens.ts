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

// Liquid Glass for the panel, ported from the site's lib/liquid.ts. Three jobs:
//   light  – one light angle (--lg-a) that follows the pointer, so the rim answers the user's own hand
//   touch  – pointer position inside interactive glass (--px/--py) for the glow under the cursor
//   lens   – per-element refraction of the backdrop with dispersion at the rim (Chromium only; other browsers keep
//            the frosted CSS material, which is the designed fallback)
//
// Differences from the site, all in service of "the user is in control":
//   - Nothing moves by itself. There is no scroll drift and no idle animation; the light only moves when the pointer does.
//   - The light settles faster (22% per frame against 8%) and swings less (±28° against ±45°).
//   - The panel is a single-page app, so glass appears and disappears all the time: a MutationObserver picks up new
//     .lq elements and drops the filters of removed ones. The site collects its glass once.
//   - Lenses are capped. Each one costs a blur and three displacement passes whenever its backdrop repaints, so past
//     the cap further elements keep the CSS blur. Small controls first: big surfaces must be .mat, never .lq.

const NS = 'http://www.w3.org/2000/svg';
const SELECTOR = '.lq';
const TOUCH = '.lq-touch';
const MAX_LENSES = 28;
/** A lensed element larger than this (px²) is a design error (it should be .mat); it keeps the CSS blur. */
const MAX_AREA = 520 * 140;

type Lens = { filter: SVGFilterElement; img: SVGFEImageElement; disp: SVGFEDisplacementMapElement[]; frost: SVGFEGaussianBlurElement; key: string };

const svgEl = <K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string | number>, parent?: Element) => {
    const e = document.createElementNS(NS, tag);
    for (const k in attrs) e.setAttribute(k, String(attrs[k]));
    parent?.appendChild(e);
    return e;
};

// Displacement map of a rounded slab with a convex bezel: flat in the middle, bending light inward along the edge
// normal as the surface curves away at the rim. R carries x, G carries y, 128 is neutral.
function lensMap(w: number, h: number, r: number, bezel: number): string {
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    const ctx = c.getContext('2d');
    if (!ctx) return '';
    const img = ctx.createImageData(w, h);
    const d = img.data;
    const hw = w / 2;
    const hh = h / 2;
    for (let y = 0, i = 0; y < h; y++) {
        for (let x = 0; x < w; x++, i += 4) {
            const cx = x + 0.5 - hw;
            const cy = y + 0.5 - hh;
            const qx = Math.abs(cx) - (hw - r);
            const qy = Math.abs(cy) - (hh - r);
            const ox = Math.max(qx, 0);
            const oy = Math.max(qy, 0);
            const len = Math.hypot(ox, oy);
            const inside = r - len - Math.min(Math.max(qx, qy), 0); // distance in from the edge
            let dx = 0;
            let dy = 0;
            if (inside < bezel) {
                const t = 1 - Math.max(inside, 0) / bezel;
                const mag = Math.pow(t, 2.4);
                let nx = 0;
                let ny = 0; // outward normal
                if (len > 0) {
                    nx = (ox / len) * Math.sign(cx);
                    ny = (oy / len) * Math.sign(cy);
                } else if (qx > qy) nx = Math.sign(cx);
                else ny = Math.sign(cy);
                dx = -nx * mag;
                dy = -ny * mag;
            }
            d[i] = 128 + dx * 127;
            d[i + 1] = 128 + dy * 127;
            d[i + 2] = 128;
            d[i + 3] = 255;
        }
    }
    ctx.putImageData(img, 0, 0);
    return c.toDataURL();
}

let started = false;

/** Starts the light, the touch glow and the lens for the whole document. Safe to call more than once. */
export function startLens(): void {
    if (started || typeof document === 'undefined' || typeof matchMedia !== 'function') return;
    started = true;

    const root = document.documentElement;
    const still = matchMedia('(prefers-reduced-motion: reduce)').matches;

    /* light: follows the pointer only */
    if (!still) {
        let a = 135;
        let want = 135;
        let raf = 0;
        const step = () => {
            a += (want - a) * 0.22;
            root.style.setProperty('--lg-a', `${a.toFixed(1)}deg`);
            raf = Math.abs(want - a) > 0.1 ? requestAnimationFrame(step) : 0;
        };
        addEventListener(
            'pointermove',
            (e) => {
                want = 135 + (e.clientX / innerWidth - 0.5) * 56;
                if (!raf) raf = requestAnimationFrame(step);
            },
            { passive: true }
        );
    }

    /* touch: written straight from the event, so the glow never trails the cursor */
    document.addEventListener(
        'pointermove',
        (e) => {
            const t = e.target instanceof Element ? e.target.closest<HTMLElement>(TOUCH) : null;
            if (!t) return;
            const b = t.getBoundingClientRect();
            t.style.setProperty('--px', `${e.clientX - b.left}px`);
            t.style.setProperty('--py', `${e.clientY - b.top}px`);
        },
        { passive: true }
    );

    /* lens */
    const chromium = /Chrome\//.test(navigator.userAgent);
    const opaque = matchMedia('(prefers-reduced-transparency: reduce)').matches;
    if (!chromium || opaque || typeof ResizeObserver !== 'function' || typeof MutationObserver !== 'function') return;

    const svg = svgEl('svg', { 'aria-hidden': 'true', style: 'position:absolute;width:0;height:0;pointer-events:none' });
    const made = new Map<HTMLElement, Lens>();
    let n = 0;

    const drop = (el: HTMLElement) => {
        const f = made.get(el);
        if (!f) return;
        f.filter.remove();
        made.delete(el);
        el.style.removeProperty('backdrop-filter');
        el.style.removeProperty('-webkit-backdrop-filter');
    };

    const settle = new WeakMap<HTMLElement, ReturnType<typeof setTimeout>>();

    /** Draws the lens for the element's current size: the bezel map and the per-channel displacement. */
    const fit = (_el: HTMLElement, f: Lens, w: number, h: number, r: number, frost: number, strength: number, key: string) => {
        const bezel = Math.max(6, Math.min(r, h * 0.42, 30)); // width of the curved rim that bends light
        f.key = key;
        f.img.setAttribute('href', lensMap(w, h, r, bezel));
        f.img.setAttribute('width', String(w));
        f.img.setAttribute('height', String(h));
        f.frost.setAttribute('stdDeviation', String(frost));
        const scale = strength || bezel * 2.4;
        f.disp.forEach((dm, i) => dm.setAttribute('scale', String(scale * (1 - i * 0.07))));
    };

    const build = (el: HTMLElement) => {
        // The "Refraction lens" theme setting writes data-ast-lens on <html>.
        if (root.dataset.astLens === 'false') return drop(el);
        const w = el.offsetWidth;
        const h = el.offsetHeight;
        // Glass inside a material surface cannot see the page (the surface is a backdrop root), so a lens there would
        // refract nothing: it keeps the rim, the glow and the tint, and skips the filter.
        const large = el.dataset.lens === 'large';
        if (!w || !h || (w * h > MAX_AREA && !large) || el.closest('.mat')) return drop(el);
        const cs = getComputedStyle(el);
        const r = Math.min(parseFloat(cs.borderTopLeftRadius) || 0, w / 2, h / 2);
        const frost = parseFloat(cs.getPropertyValue('--lg-frost')) || 0.7;
        const strength = Number(el.dataset.lg) || 0;
        const key = `${w}x${h}r${r}f${frost}s${strength}`;
        let f = made.get(el);
        if (f?.key === key) return;
        // A big surface (the sidebar) resizes for ~0.5s when it opens or closes. Rebuilding a map every frame would
        // cost more than it shows, and a stale map would refract wrongly, so it falls back to the plain blur while it
        // moves and takes its lens again once the size has stopped changing.
        if (large && f) {
            const css = 'blur(14px) saturate(170%) brightness(1.1)';
            el.style.setProperty('backdrop-filter', css);
            el.style.setProperty('-webkit-backdrop-filter', css);
            clearTimeout(settle.get(el));
            settle.set(
                el,
                setTimeout(() => {
                    const own = `url(#${f?.filter.id}) saturate(170%) brightness(1.1)`;
                    el.style.setProperty('backdrop-filter', own);
                    el.style.setProperty('-webkit-backdrop-filter', own);
                    fit(el, f as Lens, w, h, r, frost, strength, key);
                }, 160)
            );
            return;
        }
        if (!f) {
            if (made.size >= MAX_LENSES) return;
            if (!svg.isConnected) document.body.appendChild(svg);
            const id = `astlq${n++}`;
            const filter = svgEl('filter', { id, x: 0, y: 0, width: '100%', height: '100%', 'color-interpolation-filters': 'sRGB' }, svg);
            const img = svgEl('feImage', { x: 0, y: 0, result: 'map', preserveAspectRatio: 'none' }, filter);
            const blur = svgEl('feGaussianBlur', { in: 'SourceGraphic', result: 'src' }, filter);
            // one displacement per colour channel, each bent slightly less than the last: dispersion at the rim
            const disp = ['1 0 0 0 0 0 0 0 0 0 0 0 0 0 0', '0 0 0 0 0 0 1 0 0 0 0 0 0 0 0', '0 0 0 0 0 0 0 0 0 0 0 0 1 0 0'].map((m, i) => {
                const dm = svgEl('feDisplacementMap', { in: 'src', in2: 'map', xChannelSelector: 'R', yChannelSelector: 'G' }, filter);
                svgEl('feColorMatrix', { values: `${m} 0 0 0 1 0`, result: `c${i}` }, filter);
                return dm;
            });
            svgEl('feBlend', { in: 'c0', in2: 'c1', mode: 'screen', result: 'rg' }, filter);
            svgEl('feBlend', { in: 'rg', in2: 'c2', mode: 'screen' }, filter);
            f = { filter, img, disp, frost: blur, key: '' };
            made.set(el, f);
            const css = `url(#${id}) saturate(170%) brightness(1.1)`;
            el.style.setProperty('backdrop-filter', css);
            el.style.setProperty('-webkit-backdrop-filter', css);
        }
        fit(el, f, w, h, r, frost, strength, key);
    };

    const ro = new ResizeObserver((entries) => entries.forEach((e) => build(e.target as HTMLElement)));
    const watched = new WeakSet<Element>();
    const watch = (el: HTMLElement) => {
        if (watched.has(el)) return;
        watched.add(el);
        ro.observe(el); // fires once on observe, which builds the lens
    };

    let queued = false;
    const sweep = () => {
        queued = false;
        made.forEach((_, el) => {
            if (!el.isConnected || !el.matches(SELECTOR)) {
                ro.unobserve(el);
                watched.delete(el);
                drop(el);
            }
        });
        document.querySelectorAll<HTMLElement>(SELECTOR).forEach(watch);
    };
    // One pass per frame however many nodes a navigation swaps.
    const queue = () => {
        if (queued) return;
        queued = true;
        requestAnimationFrame(sweep);
    };

    new MutationObserver(queue).observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'data-ast-lens'] });
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', queue, { once: true });
    else queue();
}

/* ― Built by DPDX Development · Bengaluru · dpdx.in · for Astrelyse ― */
