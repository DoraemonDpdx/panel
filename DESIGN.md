# Astrelyse Liquid Glass — DESIGN.md

The design contract for the glass on the Astrelyse Hosting landing page. Read this before adding, restyling or
animating anything translucent. It describes what is shipped, why it is built that way, and the rules that keep it
looking and feeling like one material.

This is a web approximation of Apple's Liquid Glass. It is not an Apple API and makes no claim to match it pixel
for pixel. The rules are taken from Apple's Human Interface Guidelines (Materials, Motion) and "Adopting Liquid
Glass"; the implementation is ours.

| Where | What |
| --- | --- |
| `app/globals.css` | Tokens, both material tiers, rim, glow, nav capsule, accessibility fallbacks |
| `lib/liquid.ts` | `liquify()`: the light, the touch glow position, and the refraction lens |
| `components/Landing.tsx` | Markup, the `liquify()` call, nav scroll state, the nav lens |

---

## 1. Principles

1. **Glass is a layer, not a decoration.** Liquid Glass is the floating functional layer: navigation and controls.
   It sits above content and lets content show through. Content itself does not become Liquid Glass.
2. **Content comes first.** The material exists to draw attention to what is behind it. If a glass element competes
   with the content beneath it, it is wrong.
3. **Use it sparingly.** Full Liquid Glass is reserved for the most important functional elements. Everything else
   uses the quieter material tier.
4. **It behaves like glass.** It bends what is behind it at the rim, catches light on its edge, and the light moves.
   A static translucent box with a border is not Liquid Glass.
5. **It behaves like liquid.** It responds to touch, springs back, and stretches when it travels. Motion is brief,
   purposeful and tied to an action.
6. **Legibility beats effect.** Where text is dense or the backdrop is busy, add frost. Never trade readability for
   transparency.
7. **It adapts to people.** Reduced transparency, increased contrast and reduced motion each have a defined
   fallback. None of them is optional.

---

## 2. The two tiers

Every translucent surface on the site belongs to exactly one tier.

| | **Liquid Glass** | **Material** |
| --- | --- | --- |
| Role | Floating controls and navigation | Content containers |
| Apple equivalent | Liquid Glass (clear variant, regular for the nav) | Standard materials |
| Selector | `.lg`, `.btn` | `.panel`, `.feat`, `.plan`, `.regions`, `.status`, `.foot-card` |
| Elements | Nav capsule, all buttons, hero chips, hero satellites, hero stats dock | Workload panels, feature cards, pricing plans, region grid, status pill, footer slab |
| Backdrop | Refracted through a lens (Chromium); `blur(10px)` fallback | `blur(22px) saturate(165%) brightness(1.06)` |
| Rim | Specular ring that follows the light | Static hairline with a lit top edge |
| Pointer glow | Yes, on interactive elements | No (feature cards keep their own blue spotlight) |
| Press / spring | Yes | No |

**Choosing a tier for a new element**

- Is it a control or navigation that floats over other content? → Liquid Glass.
- Does it hold content (text blocks, lists, data)? → Material.
- Is it glass sitting inside glass? → Do not make it clear glass. Give it a tint (like the primary button) or a
  plain fill (like `.panel .spec` and `.feat .ic`). See section 9.

---

## 3. Tokens

### 3.1 Colour

| Token | Value | Use |
| --- | --- | --- |
| `--bg` | `#05060A` | Page background |
| `--bg-2` | `#0A0C14` | Raised background |
| `--ink` | `#F2F4FA` | Primary text, text on glass |
| `--ink-2` | `#A3A9BC` | Secondary text |
| `--ink-3` | `#6B7189` | Tertiary text |
| `--blue` | `#1846FF` | Brand, glows, tints |
| `--blue-deep` | `#0E2DB8` | Deep tints |
| `--lav` | `#B8B8FF` | Accent text, the cool bounce light inside glass |
| `--green` | `#39FF14` | Primary action, "online" state |

The site is dark only (`color-scheme: dark`). All glass values below assume a dark backdrop.

### 3.2 Glass custom properties

Set these on an element to adjust its glass. Never restyle `background`, `box-shadow` or `backdrop-filter` directly
when a token will do.

| Property | Default | Meaning |
| --- | --- | --- |
| `--lg-tint` | `rgba(255,255,255,.035)` | Fill colour of the glass body |
| `--lg-drop` | `0 18px 50px -18px rgba(0,0,0,.6)` | Drop shadow that lifts the element |
| `--lg-rim` | tier-specific (section 4) | Inset edge shadows |
| `--lg-frost` | `0.7` (unset) | Blur in px applied to the backdrop before it is refracted. Liquid tier only |
| `--lg-a` | `135deg` | Direction of the light. Written by `liquify()` on the root; do not set by hand |
| `--px`, `--py` | `50%` | Pointer position inside the element. Written by `liquify()` |
| `data-lg="<n>"` | `bezel × 2.4` | Attribute. Overrides the refraction strength for one element |

Tints in use:

| Surface | `--lg-tint` |
| --- | --- |
| Default glass | `rgba(255,255,255,.035)` |
| Button, hover | `rgba(255,255,255,.09)` |
| Primary button | `rgba(57,255,20,.82)`, hover `.95`, text `#04140a` |
| Nav capsule | `rgba(8,10,22,.4)` |
| Increased contrast | `rgba(8,10,22,.86)` |

### 3.3 Shape

Glass is always rounded. Controls are capsules; containers use large continuous radii.

| Element | Radius | Mobile (<768px) |
| --- | --- | --- |
| Buttons, chips, satellites, status, nav, nav lens | `999px` | same |
| Hero stats dock | `34px` | `26px` |
| Workload panel | `40px` | `30px` |
| Footer slab | `40px` | `30px` |
| Pricing plan | `34px` | same |
| Feature card, region grid | `30px` | same |
| Feature icon tile | `16px` | same |

**Concentricity.** A rounded shape nested in another should share its centre: inner radius ≈ outer radius −
padding. A capsule inside a container always reads as concentric, which is why nested controls are capsules. Do
not put a sharp-cornered element against the inside edge of a glass container.

### 3.4 Size

| Element | Height | Padding |
| --- | --- | --- |
| Button | `46px` | `0 22px` |
| Button, nav | `40px` | `0 18px` |
| Button, hero | `52px` (mobile `46px`) | `0 26px` |
| Chip | `34px` | `0 15px 0 12px` |
| Hero workload chip, satellite | `40px` | `0 18px` |
| Nav capsule | `60px` | `0 10px 0 18px` |
| Nav lens | `36px` | 14px beyond the link on each side |

### 3.5 Motion

| Token | Value | Use |
| --- | --- | --- |
| `--ease` | `cubic-bezier(.16,1,.3,1)` | Fades, colour, opacity |
| `--spring` | `linear(0,.28 6%,.62 12%,.9 19%,1.04 26%,1.085 33%,1.07 41%,1.03 50%,1.005 60%,.995 72%,1)` | Glass scale: release and hover. About 8% overshoot |
| `--spring` fallback | `cubic-bezier(.3,1.5,.5,1)` | Browsers without `linear()` |

---

## 4. Anatomy

A Liquid Glass element is built from five layers, back to front.

```
5  ::after   touch glow         radial light under the pointer (interactive elements only)
4  ::before  specular rim       1.2px ring, bright where the light strikes
3  content   text / icons       --ink on clear glass, dark ink on tinted glass
2  body      tint + inset glow  --lg-tint fill, --lg-rim inner shadows, --lg-drop shadow
1  backdrop  the lens           page behind, frosted, refracted at the rim, saturated, brightened
```

### 4.1 Backdrop

- **Chromium:** `backdrop-filter: url(#lgN) saturate(170%) brightness(1.1)`, set inline by `liquify()`. The SVG
  filter frosts and refracts (section 5).
- **Other browsers, and before the script runs:** `blur(10px) saturate(170%) brightness(1.08)` from the stylesheet.
- **Material tier:** `blur(22px) saturate(165%) brightness(1.06)`. More frost because these surfaces carry
  paragraphs of text.

Saturation and brightness are part of the material: glass should make the colour behind it richer, not greyer.

### 4.2 Body

`background: var(--lg-tint)`, no border. Edges come from shadows and the rim ring, never from `border`.

Liquid tier `--lg-rim`:

```css
inset 0 0 0 1px rgba(255,255,255,.05),          /* hairline so the shape never disappears */
inset 0 -10px 16px -10px rgba(184,184,255,.22), /* cool light pooling at the bottom edge  */
inset 0 0 20px rgba(255,255,255,.04),           /* faint inner volume                     */
0 1px 2px rgba(0,0,0,.4)                        /* contact shadow                         */
```

Material tier `--lg-rim`:

```css
inset 0 0 0 1px rgba(255,255,255,.08),
inset 0 1px 0 rgba(255,255,255,.26),            /* lit top edge  */
inset 0 -1px 0 rgba(255,255,255,.07),
inset 0 -12px 18px -12px rgba(184,184,255,.14),
0 1px 2px rgba(0,0,0,.4)
```

### 4.3 Specular rim (`::before`)

A 1.2px ring cut out with a mask, painted with two gradients:

```css
background:
  linear-gradient(var(--lg-a,135deg), rgba(255,255,255,.92), rgba(255,255,255,.06) 30%,
                  rgba(255,255,255,.03) 70%, rgba(255,255,255,.55)),
  linear-gradient(180deg, rgba(255,255,255,.3), rgba(255,255,255,.02) 55%, rgba(255,255,255,.12));
```

- The first gradient is the moving light: a hot highlight where the light enters, a dimmer one where it exits on
  the opposite side, near-dark in between.
- The second keeps the top edge softly lit at every angle so the shape always reads.
- The ring never takes pointer events.

### 4.4 Touch glow (`::after`)

`a.lg` and `.btn` only. A 130px radial highlight at `--px`/`--py`, white at 28%, fading in over `.6s` on hover.
Non-interactive glass (the stats dock, the nav capsule) has no glow: light under the pointer means "this responds".

### 4.5 Reserved pseudo-elements

On `.lg` and `.btn`, `::before` is the rim and `::after` is the glow. Do not reuse them. If an element needs its
own decoration, add a child element.

---

## 5. The lens (`lib/liquid.ts`)

`liquify(root, selector = ".lg,.btn")` is called once from `Landing.tsx` and returns a cleanup function. It does
three independent jobs.

### 5.1 Light

One global light direction for the whole page, like a device being tilted.

```
target angle = 135° + (pointerX / viewportWidth) × 90° + sin(scrollY / 420) × 16°
```

- At rest: `135°`, highlight top-left, echo bottom-right.
- Pointer far right: `225°`, highlight top-right.
- Scrolling adds a slow ±16° drift, so glass stays alive on touch devices with no pointer.
- The angle eases toward its target by 8% per frame and is written to `--lg-a` on the root element. The loop stops
  when it settles.
- Disabled under reduced motion; the rim then stays at `135°`.

### 5.2 Touch

A single delegated `pointermove` listener on the root. When the pointer is over `a.lg` or `.btn`, it writes the
pointer's position inside that element to `--px` and `--py`.

### 5.3 Refraction

Chromium only, and skipped under reduced transparency. Each matched element gets its own SVG filter, rebuilt by a
`ResizeObserver` whenever the element's size changes.

**The shape of the glass.** A flat slab with a convex bezel. The centre does not bend light; the rim does.

| Parameter | Value |
| --- | --- |
| Corner radius `r` | The element's computed `border-top-left-radius`, capped at half its width and height |
| Bezel width | `max(6, min(r, 0.42 × height, 30))` px |
| Bend profile | `t^2.4`, where `t` runs 0 at the inner edge of the bezel to 1 at the outer edge |
| Direction | Along the edge normal, sampling inward (the rim shows content from further inside) |
| Strength | `scale = bezel × 2.4`; the largest shift is half of that, 1.2 × the bezel width |
| Dispersion | Red, green and blue are displaced at 100%, 93% and 86% of `scale` |
| Frost | `--lg-frost` px of blur before displacement, default `0.7` |

**The filter graph.**

```
feImage            displacement map (R = x shift, G = y shift, 128 = none), drawn per pixel on a canvas
feGaussianBlur     SourceGraphic → frosted backdrop
feDisplacementMap  ×3, one per colour channel, each followed by a feColorMatrix isolating that channel
feBlend screen     recombine the three channels
```

Because each colour is bent by a slightly different amount, edges of bright objects behind the rim pick up a thin
colour fringe. That fringe is the detail that separates refraction from a blur.

**Frost values in use**

| Element | `--lg-frost` | Why |
| --- | --- | --- |
| Buttons, chips, satellites | `0.7` | Clear glass over a dark, rich backdrop |
| Hero stats dock | `2.5` | Carries numbers and labels |
| Nav capsule | `7` | Regular variant: text links with arbitrary content scrolling beneath |

---

## 6. Motion

Motion follows Apple's guidance: purposeful, brief, tied to an action, and optional.

### 6.1 Press and release

| State | Scale | Timing |
| --- | --- | --- |
| Rest | `1` | |
| Hover | `1.035` (hero chips `1.04`) | `.7s var(--spring)` |
| Press | `.96` | `.14s ease-out` |
| Release | back to hover | `.7s var(--spring)`, overshoots and settles |

The press is fast and the release is slow and springy. That asymmetry is what makes the glass feel like it has
mass. Scale uses the `scale` property so it never fights the GSAP `transform` used by magnetic buttons (`.mag`).

### 6.2 Nav capsule

- Over the hero the nav has no glass. This is deliberate: nothing is scrolling beneath it yet.
- Past 40px of scroll, `.nav` gains `.scrolled`. The capsule (`.nav-glass`) and the scroll-edge fade
  (`.nav::before`) both fade in over `.7s var(--ease)`.
- **Scroll-edge fade:** a 120px gradient, `rgba(5,6,10,.8)` to transparent, across the full viewport width behind
  the nav. It dims content as it passes under the bar so links stay legible.

### 6.3 Nav lens

A highlight that glides between nav links on hover and keyboard focus.

- First appearance: placed directly on the link, fades in over `.3s`.
- Moving: the leading edge travels in `.32s power3.out`; the trailing edge follows in `.6s back.out(2.2)`. The lens
  stretches in the direction of travel, then snaps closed with a slight overshoot.
- Leaving the links: fades out over `.4s`.
- The lens is a tinted fill with a lit rim. It has no `backdrop-filter`, because it sits on the nav capsule and
  glass must not be stacked on glass.

### 6.4 Ambient

- Hero satellites bob ±7px over 7s, staggered.
- The rim light follows the pointer and drifts with scroll (section 5.1).

Nothing else on glass moves by itself. Do not add idle shimmer, rotating borders or looping sheens to glass.

---

## 7. Component reference

### Button (`.btn`)

- `.btn-primary`: tinted glass, green at 82%, dark text, green drop shadow. One per view region; it is the single
  most important action.
- `.btn-ghost`: clear glass, `--ink` text.
- Optional `.mag` adds the magnetic pull (GSAP). Optional trailing icon uses `.ic` and nudges 3px on hover.

### Chip (`.chip.lg`)

A small capsule label. As an `<a>` it is interactive and gets the glow and spring; as a `<div>` or `<span>` it is
static glass.

### Satellite (`.chip.lg.sat`)

Decorative chips floating over the hero globe. `aria-hidden`. They exist to show the lens working against a rich
backdrop.

### Stats dock (`.hero-dock.lg`)

Three figures on one slab, separated by 1px dividers at `rgba(255,255,255,.12)`. Not interactive.

### Nav (`.nav`)

```html
<header class="nav" id="nav">
  <span class="nav-glass lg" aria-hidden="true"></span>   <!-- the capsule, behind everything -->
  <a class="brand">…</a>
  <nav class="nav-links" id="navLinks">
    <span class="nav-lens" id="navLens" aria-hidden="true"></span>
    <a>…</a>
  </nav>
  <a class="btn btn-primary">…</a>
</header>
```

The glass is a separate child so it can fade independently of the nav's contents.

### Material surfaces

`.panel`, `.feat`, `.plan`, `.regions`, `.status`, `.foot-card`. They share the material backdrop and rim. Colour
comes from a radial gradient layered over `--lg-tint` (for example the per-panel `--tint`), never from a different
backdrop recipe.

---

## 8. Accessibility

| Setting | Behaviour |
| --- | --- |
| `prefers-reduced-transparency: reduce` | Glass becomes solid `#10142A`, all `backdrop-filter` removed, the lens is never built. Primary button becomes solid green |
| `prefers-contrast: more` | Tint becomes `rgba(8,10,22,.86)`; the rim becomes a solid 1.5px edge at 60% white. Primary button becomes solid green |
| `prefers-reduced-motion: reduce` | No spring scale, no light tracking, the nav lens jumps instead of gliding, satellites stop bobbing |
| Keyboard | The nav lens follows focus. Focus ring is `2px solid var(--lav)` with `3px` offset and must stay visible on glass |

Rules:

- Text on clear glass is `--ink` or `--ink-2`. Never place `--ink-3` text on clear glass.
- Text on tinted glass must be chosen for the tint (dark ink on green).
- Motion is never the only signal. Hover, focus and active states must also change tint or light.
- Any new glass element must be checked with each of the three settings above.

---

## 9. Rules

**Do**

- Use Liquid Glass for controls and navigation that float over content.
- Give glass something to refract. It earns its place over the globe, gradients and imagery, not over flat black.
- Add frost (`--lg-frost`) as text density rises.
- Use a tint to mark the one primary action.
- Keep shapes rounded and concentric.

**Don't**

- Don't use Liquid Glass for content containers. Use the material tier.
- Don't stack clear glass on glass. A glass element inside another glass element cannot see the page behind its
  parent, so it has nothing to refract. Tint it or fill it.
- Don't crowd or overlap glass elements.
- Don't add borders. Edges are shadows and the rim ring.
- Don't override `backdrop-filter` on a `.lg`/`.btn` element; `liquify()` owns it.
- Don't put clear glass over a bright backdrop without a dimming layer. Apple's figure is a dark layer at 35%
  opacity; the site is dark throughout, so none is used today.
- Don't animate glass for its own sake.

---

## 10. Adding a new glass element

1. Pick the tier (section 2).
2. **Liquid Glass:** add the class `lg` (buttons use `btn`). The element must:
   - be positioned (`relative`, `absolute` or `fixed`), so the rim and glow can anchor to it;
   - have a `border-radius`;
   - leave `::before` and `::after` free;
   - be in the DOM when `Landing` mounts. `liquify()` collects elements once; glass added later gets the CSS
     material but no lens.
3. **Material:** add the element's selector to the shared material rule in `globals.css` and to the
   reduced-transparency and increased-contrast rules.
4. Tune with tokens only: `--lg-tint`, `--lg-drop`, `--lg-frost`, or `data-lg` for refraction strength.
5. Check it over its real backdrop, on hover, press and focus, and with reduced transparency, increased contrast
   and reduced motion.

---

## 11. Engineering constraints

- **Browser support.** Refraction needs SVG filters inside `backdrop-filter`, which only Chromium supports.
  Safari and Firefox get the blurred material with the full rim, glow and motion. This fallback is by design.
- **Backdrop roots.** An ancestor with `filter`, `opacity < 1`, `mask`, `clip-path`, `mix-blend-mode` or its own
  `backdrop-filter` cuts its descendants off from the page behind it. Glass inside such an ancestor refracts only
  what that ancestor paints. This is why nested glass is tinted, and why glass looks flat mid-way through a fade.
- **Cost.** Each lensed element runs a blur and three displacement passes on every frame its backdrop changes.
  Keep lensed elements small and few; the largest today is the nav capsule. Large surfaces stay in the material
  tier for this reason as much as for the design rule.
- **Maps are rebuilt on resize only.** Hover and press use `scale`, which does not change layout size, so they
  never trigger a rebuild.
- **Verification so far.** Checked in Chromium at desktop width: 60 fps on the hero, no console errors. Safari,
  Firefox and phone widths have not been checked.

---

## 12. Sources

- Apple Human Interface Guidelines — Materials: https://developer.apple.com/design/human-interface-guidelines/materials
- Apple Human Interface Guidelines — Motion: https://developer.apple.com/design/human-interface-guidelines/motion
- Apple — Adopting Liquid Glass: https://developer.apple.com/documentation/technologyoverviews/adopting-liquid-glass
- Apple — Liquid Glass overview: https://developer.apple.com/documentation/technologyoverviews/liquid-glass
