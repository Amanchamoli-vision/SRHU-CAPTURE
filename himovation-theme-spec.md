# Website Theme Specification
**Source:** https://aicentre-lab.github.io/Himovation/ (HIMOVATION 2026 · SRHU)
**Stack:** Static HTML + Tailwind CDN (Play CDN, v3.4.17) with a custom theme extension, plain CSS design tokens, and vanilla JS templating (no framework).

---

## 1. Design Overview
- Style: modern, institutional/professional with a subtle tech-festival edge — not corporate-flat, not consumer-startup-playful. Reads as "university event site with a technical audience."
- Visual language: light, airy off-white base with deep blue/sky-blue accents and one warm amber CTA color for contrast. Generous whitespace, soft large-radius cards, thin hairline borders instead of heavy shadows.
- Supports both **light and dark themes** via a `data-theme="dark"` attribute on `<html>`, toggled client-side and persisted in `localStorage`. Certain sections (footer, register band) are permanently dark via a `.theme-dark` class regardless of the site-wide theme.
- Visual hierarchy: eyebrow label (small uppercase accent-colored tag) → large Sora display heading → muted Inter body copy. Consistent across every section.
- Motion is subtle and purposeful: scroll-reveal fade/slide-up on sections, magnetic hover glow on primary buttons, tilt/parallax on card icons — nothing gratuitous.

## 2. Color Palette
All colors are defined as CSS custom properties holding **space-separated RGB triplets** (not hex), consumed via `rgb(var(--token) / <alpha>)`. This lets Tailwind's opacity modifiers work with custom color names.

### Light theme (default, `:root`)
| Token | RGB | Hex | Usage |
|---|---|---|---|
| `--c-base` | 245 247 251 | `#F5F7FB` | Page background |
| `--c-surface` | 255 255 255 | `#FFFFFF` | White bands, section backgrounds |
| `--c-raised` | 232 237 245 | `#E8EDF5` | Chips, tabs, inputs, raised surfaces |
| `--c-brand` | 13 54 104 | `#0D3668` | SRHU "Prussian Blue" — brand color |
| `--c-ink` | 15 26 46 | `#0F1A2E` | Primary text |
| `--c-muted` | 75 90 115 | `#4B5A73` | Secondary text (7:1 contrast on white) |
| `--c-line` | 15 23 42 | `#0F172A` | Hairlines, used at low alpha only |
| `--c-accent` | 3 105 161 | `#0369A1` | Links, eyebrows, focus rings, active nav |
| `--c-ember` | 245 165 36 | `#F5A524` | Warm CTA fill (primary button) |
| `--c-ember-ink` | 180 83 9 | `#B45309` | Warm text-on-light variant |
| `--c-ok` | 4 120 87 | `#047857` | Success state |
| `--c-err` | 185 28 28 | `#B91C1C` | Error state |

### Dark theme (`[data-theme="dark"]` or `.theme-dark`)
| Token | RGB | Hex | Usage |
|---|---|---|---|
| `--c-base` | 7 11 20 | `#070B14` | Page background ("midnight") |
| `--c-surface` | 11 21 38 | `#0B1526` | Section backgrounds |
| `--c-raised` | 18 33 66 | `#122142` | Raised surfaces |
| `--c-ink` | 230 237 247 | `#E6EDF7` | Primary text |
| `--c-muted` | 154 169 191 | `#9AA9BF` | Secondary text |
| `--c-line` | 255 255 255 | — | Hairlines (low alpha) |
| `--c-accent` | 56 189 248 | `#38BDF8` | "Glacier cyan" — links, focus, active |
| `--c-ember-ink` | 245 165 36 | `#F5A524` | (swaps role in dark) |
| `--c-ok` | 110 231 183 | `#6EE7B7` | Success |
| `--c-err` | 252 165 165 | `#FCA5A5` | Error |

### Derived / component tokens (theme-aware, redefined per mode)
- `--card-bg`: `#FFFFFF` (light) / `rgb(255 255 255 / .035)` (dark, near-transparent "glass")
- `--card-border`: `rgb(15 23 42 / .08)` (light) / `rgb(255 255 255 / .08)` (dark)
- `--card-shadow`: soft double shadow in light (`0 1px 2px rgb(15 23 42/.04), 0 10px 28px -14px rgb(15 23 42/.14)`) / `none` in dark (relies on border only)
- `--input-bg`: `#FFFFFF` (light) / `rgb(18 33 66 / .55)` (dark)
- `--backdrop`: modal/overlay scrim, `rgb(15 23 42 / .45)` light / `rgb(7 11 20 / .72)` dark
- `--hero-tint`: radial tint behind hero, `rgb(13 54 104 / .10)` light / `rgb(13 54 104 / .35)` dark
- `--hero-grad`: `linear-gradient(100deg, #0D3668 0%, #0369A1 50%, #D97706 100%)` light / `linear-gradient(100deg, #38BDF8 0%, #7dd3fc 45%, #F5A524 100%)` dark — used for gradient-clipped hero year/headline text

### Category/track accent colors (semantic, event-type coding — not core UI colors, but used as a `--track` CSS var per card for icon rings, timeline dots, borders)
| Track | Hex |
|---|---|
| Hackathon | `#0EA5E9` |
| Robo-War | `#F59E0B` |
| E-Sports | `#8B5CF6` |
| Exhibition | `#10B981` |
| Common/All | `#64748B` |

**Pattern to reuse:** define base colors as RGB-triplet CSS variables at `:root`, map them to Tailwind `theme.extend.colors` as `rgb(var(--token) / <alpha-value>)`, and redefine the same variable names under a dark-mode selector. This gives full Tailwind opacity-utility support (`bg-brand/40`, etc.) while keeping single-source-of-truth theming.

## 3. Typography System
- **Display/heading font:** Sora (weights loaded: 500, 600, 700, 800), via Google Fonts. Applied to all `h1–h4`, buttons, eyebrows, numeric stats, nav.
- **Body font:** Inter (weights: 400, 500, 600), via Google Fonts. Applied to `body`, paragraphs, form inputs.
- Tailwind config maps: `fontFamily.display = ['Sora', 'system-ui', 'sans-serif']`, `fontFamily.sans = ['Inter', 'system-ui', 'sans-serif']`.
- Base body: `font-size: 1rem; line-height: 1.5;`

| Class | Font | Weight | Size | Line-height | Letter-spacing | Notes |
|---|---|---|---|---|---|---|
| `.eyebrow` | Sora | 600 | 0.75rem | — | 0.18em, uppercase | Accent-colored section label |
| `.h2` (section heading) | Sora | 700 | `clamp(1.9rem, 4vw, 3rem)` | 1.06 | -0.02em | Fluid heading |
| `.h3` (card/subsection) | Sora | 600 | 1.25rem | 1.25 | -0.01em | |
| `.hero-title` | Sora | 800 | `clamp(2.9rem, 10.5vw, 8rem)` | 0.92 | -0.035em | Massive fluid hero type |
| `.num` / `.stat-num` / `.cd-num` | Sora | 700 | varies (`clamp` per context) | 1 | -0.02em to -0.03em | `font-variant-numeric: tabular-nums` |
| `.wordmark` | Sora | 800 | 1.25rem | — | 0.12em | Fallback text logo |
| `.prose-muted` (body copy) | Inter (inherited) | 400 | 1rem | 1.7 | — | Muted color, generous leading |
| Button text (`.btn`) | Sora | 600 | 0.95rem | — | 0.01em | |
| `.nav-link` | Inter (inherited) | 500 | 0.9rem | — | — | |
| `.menu-link` (mobile) | Sora | 600 | 1.75rem | — | -0.01em | |

Additional notes:
- `h1–h4 { text-wrap: balance; margin: 0; }` — balanced heading line-wraps by default.
- Body copy on desktop uses justified text with hyphenation on select long-form blocks: `.prose-justify` (≥768px), `.prose-justify-lg` (≥1024px).

## 4. Header & Navigation
- **Height:** fixed `--header-h: 4.25rem` (68px), consistent across breakpoints.
- **Position:** `position: fixed; top:0; z-index:50;` — always fixed, transparent at page top.
- **Scroll behavior:** on scroll (`y > 24`), header gains `.is-scrolled`: translucent background (`rgb(var(--c-base) / .78)`), `backdrop-filter: blur(16px)`, a hairline bottom border, and a soft drop shadow. Transition: `background-color .35s, border-color .35s, box-shadow .35s`.
- **Progress bar:** a 2px fixed top bar (`#progress`) scales horizontally with scroll position, gradient from accent → ember.
- **Logo:** wrapped in `.logo-plate` (`display:inline-flex; align-items:center; height:3.75rem`); the `<img>` is `height:100%; width:auto;` so it scales to the plate height while preserving aspect ratio. No box, border, or background around the logo — it sits directly in the flex row next to the wordmark text. A `<span class="wordmark" hidden>` fallback text is swapped in via `onerror` if the image fails to load.
- **Nav layout:** desktop nav links (`ul.hidden.lg:flex`, `gap-6`) appear only ≥1024px (`lg`); below that, a hamburger opens a full-screen overlay menu.
- **Nav link style:** `.nav-link` — 0.9rem/500 weight, muted color, animated underline (`::after`, `scaleX(0→1)` on hover/active, `transform-origin: left`, 250ms cubic-bezier). Active page gets the underline permanently via `[aria-current="true"]`.
- **CTA in header:** a small primary button (`.btn.btn-primary.btn-sm`, "Register") shown ≥640px (`sm`), plus a theme toggle icon button and (on mobile) the hamburger.
- **Hamburger:** 3-line animated icon (`.hamburger`), morphs to an X (`.is-open`: rotate ±45°, middle bar fades) with 300ms cubic-bezier transitions.
- **Mobile menu:** full-viewport overlay (`position:fixed;inset:0`), blurred background, fades/slides in (`opacity + translateY(-10px)→none`, 280ms). Nav links inside are large (1.75rem Sora 600) with hairline dividers between them, plus a secondary grid of "event page" chips and a full-width CTA button at the bottom.
- **Responsive breakpoints for nav:** full nav row visible ≥1024px; CTA button visible ≥640px; below 1024px everything collapses to logo + theme toggle + hamburger.

## 5. Layout & Spacing
- **Max content width:** custom Tailwind token `maxWidth.wrap = 76rem` (1216px), applied as `max-w-wrap` on every section's inner container.
- **Horizontal padding:** `px-5` (1.25rem) on mobile, `sm:px-8` (2rem) from 640px up — consistent on every section wrapper.
- **Vertical section spacing:** `py-14` (3.5rem) mobile → `md:py-20` (5rem) ≥768px, on nearly all sections.
- **Section rhythm:** alternating background bands (`bg-ground` vs `bg-surface/60–70`) separate sections instead of hard borders in most cases; a couple of section boundaries use a custom wavy "ridge" SVG divider (`.divider`, 2.5rem tall mobile / 3.5rem ≥768px) for a mountain-skyline motif (thematically tied to "Himalayan").
- **Grid/flex:** CSS Grid used for the bento feature grid, stats grid, and two-column layouts (`lg:grid-cols-[1.25fr_1fr]` etc. — asymmetric ratio columns, not even splits). Flexbox used for nav, buttons, and card internals.
- **Card gaps:** `gap-1rem` typical in grids (`.bento { gap: 1rem }`), `gap-5`/`gap-6` (1.25–1.5rem) in form and content grids.
- **Border radius scale:** small (chips/badges) = `999px` (full pill); buttons = `.8rem`/`.65rem` (sm); cards = `1.25rem`; modals = `1.5rem`; icon tiles = `.75–.9rem`. Generally "soft, generous, consistent" — nothing sharp, nothing excessively round except pills.
- **Container widths for special elements:** countdown/timeline max-width `28rem` (`max-w-md`), map aspect-ratio `16:10` mobile → `21:9` (md) → `3:1` (lg).

## 6. Buttons
Base `.btn`: inline-flex, centered, `gap:.5rem`, `min-height:2.9rem`, `padding:.8rem 1.5rem`, `border-radius:.8rem`, Sora 600 `.95rem`, letter-spacing `.01em`, no text-decoration, `overflow:hidden`, transition on transform/shadow/colors (250ms cubic-bezier `.2,.7,.2,1`).

- **Primary** (`.btn-primary`): solid ember/amber fill (`#F5A524`), dark ink text (`#12100a`), warm drop shadow. On hover: lightens to `#ffb43a`, lifts `translateY(-1px)`, shadow intensifies, and a radial "spotlight" gradient fades in following the cursor position via `--mx/--my` custom properties (mouse-tracked spotlight/glow effect).
- **Ghost** (`.btn-ghost`): transparent/near-transparent background, ink text, thin hairline border; hover adds accent-tinted border/background and the same lift.
- **Sizes:** `.btn-sm` (min-height 2.3rem, smaller padding/text/radius), `.btn-block` (full width).
- **Icon-inner wrapper:** `.btn-inner` is a nested flex span so icon+label can animate together independently of the button's own hover transform (used for icon slide-in effects).
- All CTAs use a `data-magnetic` attribute — JS likely applies a magnetic cursor-follow micro-interaction (implementation is in `site.js`, not pure CSS).

## 7. Cards
- **Base "glass" card** (`.glass`): `background: var(--card-bg); border: 1px solid var(--card-border); border-radius: 1.25rem; box-shadow: var(--card-shadow);` — theme-aware (solid white+shadow in light, near-transparent+border-only in dark, true "glass" effect). Add `.glass-blur` for `backdrop-filter: blur(14px)` where true glassmorphism is wanted (e.g. over the hero/contact form).
- **Bento feature cards** (`.bento-card`): same glass base, `padding:1.5rem`, plus: a 2px top accent bar (`::before`, gradient from the card's `--track` color to transparent), a hover-only radial glow following cursor position (`::after`, same `--mx/--my` pattern as buttons), hover lift (`translateY(-4px)`) with track-colored border/shadow tint, and a giant faint numeral/icon "watermark" in the corner (`.bento-watermark`, 4.5rem Sora 800 at ~4.5% opacity).
- **Countdown tiles** (`.cd-tile`): small glass cards, centered text, large tabular-nums number + tiny uppercase label beneath.
- **Timeline cards** (`.tl-card`): glass card with a colored left border (`border-left: 2px solid var(--track)`) denoting event track; "milestone" rows get an ember-tinted background/border instead.
- **Podium bars** (results/leaderboard motif): gradient-filled bars (`color-mix` from a `--track`/`--medal` var into the raised surface color), rounded top corners only.
- **Icon tiles** (`.icon-tile`): 2.75rem square, `border-radius:.9rem`, accent-tinted background/border/icon color — used as leading icons in feature cards and contact info.

## 8. Forms & Inputs
- **Field wrapper** (`.field`): vertical flex, `gap:.4rem`; label is `.85rem/500`, ink color.
- **Input** (`.input`): `min-height:2.9rem`, `padding:.7rem .9rem`, `border-radius:.75rem`, theme-aware background (`var(--input-bg)`), hairline border (`14%` alpha), placeholder at muted/70% opacity.
- **Focus state:** border becomes accent color at 70% alpha + a soft accent-colored focus ring (`box-shadow: 0 0 0 3px rgb(var(--c-accent)/.18)`) — no default browser outline.
- **Invalid state:** `[aria-invalid="true"]` swaps border to the error color; associated `.field-error` text is `.8rem`, error-colored.
- **Select:** custom chevron via inline SVG data-URI background image (matches muted color), `appearance:none`, right-padded for the icon.
- Honeypot spam field pattern present (visually hidden, `tabindex="-1"`, `autocomplete="off"`).
- Grid layout for multi-field rows: `grid gap-5 sm:grid-cols-2`.

## 9. Icons
- No icon library/font — all icons are **hand-written inline SVGs** (`stroke="currentColor"`, `stroke-width="2"`, `stroke-linecap/linejoin="round"`), Feather/Lucide-style line icons at ~24×24 viewBox, sized via utility classes per context (e.g. `w-1.1em h-1.1em` inside buttons, `1.2rem` in icon buttons, `1.35rem` in icon tiles).
- Icons inherit `currentColor`/theme tokens, so they recolor automatically with theme and hover state — no separate icon color system.
- Logo: served as an `<img>` with an `onerror` fallback that hides the image and reveals a text `.wordmark` span instead — resilient degrade pattern. A `data-theme-logo` attribute suggests the logo source can swap per light/dark theme (`srcLight` referenced in the header render).
- Decorative background SVGs used for texture: a repeating "contour lines" pattern (`.contour-bg`, low opacity) and a mountain-ridge divider shape reused between sections (`<svg><use href="#ridge"/></svg>`, defined once and reused).

## 10. Shadows & Borders
- Borders are near-universally **hairline + low-alpha**, not solid dark lines: `rgb(var(--c-line) / .08)` to `.14` for most component borders, going up to `.25` only for de-emphasized decorative rings (e.g. scroll-cue).
- Card shadow (light mode) is a soft double-layer: a tight 1px definition shadow plus a large soft ambient shadow (`0 1px 2px rgb(15 23 42/.04), 0 10px 28px -14px rgb(15 23 42/.14)`) — no hard edges, no harsh single-layer shadow anywhere.
- Dark mode drops shadows entirely in favor of a 1px light-alpha border (`--card-shadow: none`) — glassmorphism relies on border + translucency, not shadow, in dark mode.
- Colored/glow shadows are used sparingly and semantically: primary button glow uses the ember color; bento-card hover glow and timeline node rings use the card's semantic `--track` color via `color-mix()`.
- Focus rings: solid 2px accent outline with 3px offset (`:focus-visible`), not a box-shadow — clean and consistent across all interactive elements.

## 11. Animations & Transitions
- **Easing standard:** custom cubic-bezier `(.2, .7, .2, 1)` used everywhere for anything that should feel "snappy but soft" (buttons, cards, hamburger, FAQ accordion, modal, reveal-on-scroll). Plain `ease`/linear only for simple opacity fades.
- **Scroll reveal:** `.reveal` elements start `opacity:0; translateY(16px)` and animate in (`opacity .38s ease, transform .42s cubic-bezier(...)`) with a stagger delay driven by a `--i` custom property per element (`calc(var(--i,0) * 55ms)`) — a JS IntersectionObserver almost certainly toggles `.is-visible`.
- **Hover micro-interactions:** cards/buttons lift slightly (`translateY(-1px to -4px)`) on hover, never scale-jump; cursor-tracked radial glow on buttons and bento cards (`--mx/--my` custom props updated via JS mousemove).
- **Accordion (FAQ):** CSS Grid-based expand using `grid-template-rows: 0fr → 1fr` trick (avoids the `height:auto` transition problem), 320ms.
- **Modal:** slides up from bottom + fades (`translateY(28px)→0, opacity 0→1`, 320ms), backdrop gets a 6px blur.
- **Live/pulse indicators:** a "live" dot pulses via `box-shadow` keyframe animation (ping effect, 1.8s ease-out infinite).
- **Reduced motion:** a full `@media (prefers-reduced-motion: reduce)` block disables scroll-behavior smoothing, reveal transitions, pulsing dots, and most component transitions — accessibility-conscious by default.

## 12. Responsive Design
Tailwind's default breakpoints are used throughout (no custom breakpoints defined): `sm:640px`, `md:768px`, `lg:1024px`.
- **Header/nav:** collapses from full horizontal nav (`lg:flex`) to hamburger+overlay below 1024px; CTA button hides below 640px.
- **Typography:** nearly all large headings use `clamp()` for fluid scaling instead of discrete breakpoint jumps (hero title, section h2, stat numbers, countdown numbers) — smooth resize rather than stepped.
- **Grids:** two-column content sections stack to one column below `lg`; the bento grid goes 1 col (mobile) → 2 col (`sm`) → 4 col with custom named grid-areas (`lg`); stats grid goes 2 col → 4 col (`md`) with divider lines only appearing between columns via `md:divide-x`.
- **Timeline:** single left-aligned spine on mobile; becomes a true center-spined alternating left/right timeline at `md` (768px) for the main schedule, though a "compact" variant forces single-spine at every width for embedded/event-page contexts.
- **Map aspect ratio** narrows progressively: `16:10` → `21:9` (md) → `3:1` (lg), i.e. gets wider/shorter as viewport grows.
- **Spacing:** section vertical padding steps from `py-14` to `md:py-20`; container horizontal padding steps from `px-5` to `sm:px-8`.

## 13. Component Design System
Reusable class-based components defined once in the shared stylesheet and composed via utility classes in markup:
- `.btn` / `.btn-primary` / `.btn-ghost` / `.btn-sm` / `.btn-block`
- `.chip` / `.chip-ember` / `.chip-solid` (pill-shaped tags/badges, with icon slot)
- `.glass` / `.glass-blur` (card surface primitive)
- `.icon-btn` / `.icon-tile` (square icon containers, two treatments)
- `.bento` / `.bento-card` / `.bento-icon` / `.bento-watermark` (feature grid system)
- `.tab` / `.legend-btn` (segmented control / filter pill patterns)
- `.tl` / `.tl-row` / `.tl-card` / `.tl-node` / `.tl-time` (timeline system, responsive left/right alternating)
- `.faq-btn` / `.faq-panel` (accordion)
- `.field` / `.input` / `.field-error` (form primitives)
- `.step` / `.step-timeline` (numbered "how it works" list with connecting line)
- `.podium` / `.podium-medal` / `.podium-bar` (ranking/results display)
- `.stat-cell` / `.stat-num` (large number stat blocks)
- `.cd-tile` / `.cd-num` / `.cd-label` (countdown component)
This is a **plain-CSS component layer sitting on top of Tailwind utilities** — Tailwind handles layout/spacing/responsive utilities inline in markup, while anything with animation, pseudo-elements, or theme-variable logic is pulled into a named CSS class in the shared stylesheet. Recommend following the same split when reimplementing: utility classes for layout, custom classes for stateful/animated/themed components.

## 14. CSS/Tailwind Configuration
- Tailwind is loaded via the **Play CDN** (`<script src="https://cdn.tailwindcss.com/3.4.17">`), not a build step — configuration is a plain JS object (`tailwind.config = {...}`) loaded in a separate script tag immediately after.
- Theme extension (`theme.extend`), not a full override — Tailwind's defaults remain available alongside the custom tokens:
```js
tailwind.config = {
  theme: {
    extend: {
      colors: {
        ground:  'rgb(var(--c-base) / <alpha-value>)',
        surface: 'rgb(var(--c-surface) / <alpha-value>)',
        raised:  'rgb(var(--c-raised) / <alpha-value>)',
        brand:   'rgb(var(--c-brand) / <alpha-value>)',
        ink:     'rgb(var(--c-ink) / <alpha-value>)',
        muted:   'rgb(var(--c-muted) / <alpha-value>)',
        line:    'rgb(var(--c-line) / <alpha-value>)',
        accent:  'rgb(var(--c-accent) / <alpha-value>)',
        ember:   'rgb(var(--c-ember) / <alpha-value>)',
        emberink:'rgb(var(--c-ember-ink) / <alpha-value>)',
        ok:      'rgb(var(--c-ok) / <alpha-value>)',
        err:     'rgb(var(--c-err) / <alpha-value>)',
      },
      fontFamily: {
        display: ['Sora', 'system-ui', 'sans-serif'],
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
      maxWidth: { wrap: '76rem' },
      boxShadow: {
        glow: '0 0 0 1px rgb(var(--c-accent) / .35), 0 16px 48px -16px rgb(var(--c-accent) / .45)',
      },
    },
  },
};
```
- Note the naming trick: the background token is called `ground` (not `base`) specifically to avoid colliding with Tailwind's built-in `text-base` font-size utility.
- All actual color *values* live in plain CSS custom properties (`:root` and the dark-mode selector) in the separate stylesheet, not in the Tailwind config — the Tailwind config only maps names to `rgb(var(...) / <alpha-value>)` expressions. This is the key technique enabling runtime theme switching without rebuilding Tailwind.
- A CSS "no-Tailwind fallback" block exists at the top of the stylesheet (basic body/link/button/heading resets) so the page stays legible if the CDN script is ever blocked.

## 15. Design Tokens
Single source of truth = CSS custom properties on `:root`, overridden under `[data-theme="dark"], .theme-dark`. Full token list:
- **Color:** `--c-base, --c-surface, --c-raised, --c-brand, --c-ink, --c-muted, --c-line, --c-accent, --c-ember, --c-ember-ink, --c-ok, --c-err` (all as `R G B` triplets, no `rgb()` wrapper, no hex — enables `rgb(var(--x) / alpha)` composition).
- **Component-derived:** `--card-bg, --card-border, --card-shadow, --input-bg, --backdrop, --shadow-strong`.
- **Effect:** `--hero-tint, --hero-grad`.
- **Layout:** `--header-h`.
- **Per-instance (set inline via `style="--track:#hex"` or similar):** `--track` (event/category color), `--medal` (podium ranking color), `--i` (stagger index for reveal animation delay), `--mx/--my` (cursor position for glow effects), `--px/--py` (parallax offset for bento icons).
- Also declares `color-scheme: light` / `dark` on `:root` per theme, so native form controls and scrollbars match automatically.

## 16. Implementation Guidelines
1. Set up the same two-layer token system: raw RGB-triplet CSS variables for colors → mapped into Tailwind's config as named colors using `rgb(var(--x) / <alpha-value>)`. Do this **before** writing any component markup.
2. Load Sora (display/headings, weights 500–800) and Inter (body, weights 400–600) from Google Fonts; assign via `fontFamily.display` / `fontFamily.sans` in the Tailwind config.
3. Build the dark theme by re-declaring the same variable names under a `[data-theme="dark"]` (or equivalent) selector — never hardcode a second set of classes for dark mode; let the variables do the swapping.
4. Keep all borders hairline and low-alpha (8–14%) rather than solid grey; keep shadows soft/layered in light mode and border-only (no shadow) in dark mode.
5. Standardize on one easing curve, `cubic-bezier(.2,.7,.2,1)`, for all interactive/motion transitions; use plain `ease` only for simple fades.
6. Use `clamp()` for large display type (hero title, section headings, big stat numbers) instead of stepped breakpoint font sizes.
7. Compose UI from the named component classes in section 13 (`.btn`, `.glass`, `.chip`, `.bento-card`, etc.) for anything stateful/animated; use Tailwind utilities directly in markup for layout, spacing, and one-off positioning.
8. Reuse the `max-w-wrap` (76rem) + `px-5 sm:px-8` + `py-14 md:py-20` pattern on every section wrapper for consistent rhythm.
9. All icons should be inline SVG, `stroke="currentColor"`, 2px stroke, round caps/joins — never an icon font or external icon library.
10. Respect `prefers-reduced-motion`: strip transitions/animations for users who request it.

## 17. Do's and Don'ts
**Do:**
- Do use RGB-triplet custom properties + `rgb(var(--x)/alpha)` for every color, everywhere, including one-off inline styles.
- Do keep the color palette restricted: two blues (brand + accent) + one warm ember accent + neutral ink/muted/base/surface/raised. Category/track colors are the only place extra hues appear, and only for semantic tagging.
- Do keep card/button radii generous and consistent (`.75–1.25rem` range) — never mix sharp and rounded corners in the same component family.
- Do use hairline borders + soft layered shadows (light) or border-only glass (dark) — never a heavy single dark border or hard drop shadow.
- Do stagger scroll-reveal animations with a small per-item delay (~50ms) rather than animating everything at once.

**Don't:**
- Don't introduce bright, saturated, multi-color gradients — the only gradient is the subtle brand→accent→ember hero gradient, used sparingly (hero year text, register-band glow, header progress bar).
- Don't use hard black borders, sharp corners, or heavy box-shadows — it will clash with the soft/institutional feel.
- Don't hardcode colors as hex/rgb literals in component CSS — always reference the token variables so theme switching keeps working.
- Don't use an icon font or third-party icon library — inline SVG only, so icons inherit `currentColor` and theme correctly.
- Don't animate with abrupt easing (`linear`, `ease-in`) on hover/interactive elements — stick to the soft cubic-bezier standard.
- Don't skip the reduced-motion fallback when adding new animations.

## 18. Final Theme Checklist
- [ ] RGB-triplet color tokens defined for both light and dark, mapped into Tailwind config via `rgb(var(--x)/<alpha-value>)`
- [ ] Sora (display) + Inter (body) fonts loaded and wired into `fontFamily`
- [ ] `max-w-wrap` (76rem) container + `px-5 sm:px-8` + `py-14 md:py-20` rhythm applied per section
- [ ] Fixed header (~4.25rem) with scroll-triggered translucent/blur state and progress bar
- [ ] Logo rendered as a plain `<img>` inside a flex `.logo-plate`-style wrapper — no extra box/border/background
- [ ] Primary button = solid ember/amber fill + dark text + warm glow shadow; ghost button = hairline border + transparent fill
- [ ] Cards use the `.glass` pattern (solid+shadow light / transparent+border dark) with 1.25rem radius
- [ ] Hairline borders (8–14% alpha) and soft/layered or border-only shadows throughout
- [ ] All icons inline SVG, `currentColor`, 2px stroke
- [ ] Fluid `clamp()` typography on all large headings/stats
- [ ] Standard cubic-bezier `(.2,.7,.2,1)` easing on every interactive transition
- [ ] Scroll-reveal with staggered delay via a `--i` custom property
- [ ] Dark mode implemented purely via variable-redefinition under a theme selector, not duplicated component classes
- [ ] `prefers-reduced-motion` fallback disabling non-essential animation
