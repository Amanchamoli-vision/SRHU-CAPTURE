---
name: campus-capture-theme
description: Design tokens, theming and component conventions for the Campus Capture frontend (Tailwind v4, CSS-first). Use when changing colours, the app chrome, or any styling in frontend/src/index.css.
---

# Campus Capture — theme

Tailwind **v4, configured in CSS**. There is no `tailwind.config.js`; the
theme lives in `frontend/src/index.css` under `@theme inline`. Anything that
looks for a config file is out of date.

## Colours are RGB triplets, not hex

```css
--c-brand: 13 54 104;   /* #0D3668 SRHU Prussian Blue */
```

Space-separated so any alpha can be applied: `rgb(var(--c-brand) / .35)`.
**Never hardcode a hex in a component** — add or reuse a token. The palette is
documented in `himovation-theme-spec.md`.

Key tokens: `--c-base` (page), `--c-surface`, `--c-raised`, `--c-ink` (text),
`--c-muted`, `--c-line` (hairlines, low alpha only), `--c-accent` (links,
focus), `--c-ember` `#F5A524` (primary CTA fill), `--c-ok`, `--c-err`.

## The app chrome is one L-shaped blue piece

```css
--header-bg: linear-gradient(100deg, #0A2A52 0%, #0D3668 55%, #0E4378 100%);
--rail-bg:   linear-gradient(180deg, #0A2A52 0%, #0C3160 38%, #0B2C57 72%, #081F40 100%);
```

`--rail-bg` opens on exactly the colour `--header-bg` starts from, so the
header and the sidebar meet with no seam.

## The dark-island pattern

`.hv-header, .hv-band-dark, .hv-rail, .hv-menu` **re-declare the colour tokens**
(`--c-ink`, `--c-muted`, `--c-line`, `--c-raised`, `--c-accent`, `--card-bg`…).
Everything inside them turns light-on-blue with no per-component overrides —
that is why making the sidebar blue needed almost no JSX changes.

Two consequences worth knowing:

1. A popover opened from the chrome belongs to the *page*, so
   `.hv-header .hv-popover` (and the rail/menu variants) restore the page
   tokens from the `--p-*` copies captured on `:root`.
2. `--card-bg` inside the island is `rgb(255 255 255 / .07)` with
   `--card-shadow: none`. The active rail item therefore states its own
   background and inset ring rather than using `var(--card-bg)`, which would
   be nearly invisible.

## Conventions

- Component classes live in `@layer components` (`.btn`, `.chip`, `.glass`,
  `.field`, `.input`, `.rail-*`, `.hv-*`, `.progress-*`, `.toast`…). Prefer
  reusing one over new utility soup.
- Icons are inline SVG from `components/teacher/icons.jsx`,
  `stroke="currentColor"`, 2px, round caps. No icon library.
- Fonts: **Sora** for display/headings/buttons, **Inter** for body.
- Optional fields are marked `<span className="ml-2 font-normal text-muted">(Optional)</span>`;
  required ones use `<span className="req">*</span>`.
- Dark mode is `:root[data-theme="dark"]`, pre-painted by a script in
  `index.html` to avoid a flash. **Check both themes** after any colour change.
- No new npm dependencies for styling.
