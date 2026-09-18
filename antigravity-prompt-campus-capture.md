# Task Prompt for Antigravity — Campus Capture: Login UI Polish + New Landing Page

## Role & Scope Lock
You are making a **visual-only** change to a React + Vite + Tailwind CSS project called "Campus Capture" (SRHU Event Management System). Read this entire prompt before editing anything. Do not expand scope beyond what is listed under "Files you may touch."

### Hard constraints — do not violate
- Do **NOT** modify any authentication logic: `AuthContext.jsx`, `services/auth.js`, `services/session.js`, session handling, redirect logic, or form validation logic in `Login.jsx`.
- Do **NOT** modify `AuthContext.jsx` or `services/auth.js` at all, even cosmetically.
- Do **NOT** add new npm dependencies (no framer-motion, no icon libraries, no UI kits). Use Tailwind utility classes and existing inline SVGs / `frontend/public/icons.svg` only.
- Do **NOT** add custom theme tokens unless `frontend/src/index.css` already defines them (Tailwind v4 is configured there via `@theme inline`; there is no `tailwind.config.js`) - check it first before using any non-default color/spacing/font token.
- Do **NOT** change the file/folder structure except adding one new file: `frontend/src/pages/Landing.jsx`.
- Do **NOT** touch any other page, dashboard, or component outside the files listed below.
- Do **NOT** add a redirect-if-authenticated check to the new Landing page. It is a dumb, static, public page — no auth logic at all.
- Preserve all existing `data-*`/`id`/`name` attributes on form fields in `Login.jsx` that AuthContext or tests may depend on — only restructure JSX wrapping/classes around them, not the input elements' functional attributes.

## Files you may touch
1. `frontend/src/pages/auth/Login.jsx` — restructure JSX/Tailwind classes only. Every existing hook call, state variable, event handler, and conditional render tied to auth/loading/error state must remain functionally identical (same variables read, same functions called, same conditions). You may reorder/wrap them in new markup.
2. `frontend/src/pages/Landing.jsx` — **new file**, full page, no auth logic.
3. `frontend/src/App.jsx` — **only the routing block**. Change so `"/"` renders `<Landing />` and `"/login"` renders `<Login />`. Do not rewrite the rest of the file. Show me a diff, not a full rewrite.

## Files to read for context before writing code (do not edit)
- `frontend/src/pages/auth/Register.jsx` — confirm whether registration is public self-serve or role-restricted (e.g. only admins/deans can create accounts). If restricted, Landing must **not** show a "Register" or "Sign up" CTA — only a single "Log in" CTA.
- `frontend/tailwind.config.js` — confirm available theme tokens (colors, fonts, spacing) before styling. Use only what's defined here plus Tailwind's own defaults.
- `frontend/src/context/AuthContext.jsx` — read-only, to confirm the exact shape/name of the loading flag (e.g. `authLoading`) so the fade-in/skeleton logic in Login.jsx wraps the correct existing condition instead of inventing a new one.
- `frontend/src/assets/logo-srhu.png` — reuse this exact asset in both Login and Landing; do not replace or recompress it.

## PART 1 — Login.jsx visual improvements
Keep the existing two-panel concept (left branding panel, right form panel). Improve only:

1. **Typography hierarchy** — tighten line-height on headline/subtext, increase weight contrast between heading and body copy. Use existing Tailwind type scale only.
2. **Left panel treatment** — replace the plain `blue-900 → indigo-900` gradient with a more distinctive but still institutional/professional treatment: a subtle background pattern, mesh, or soft radial glow layered under/over the gradient. Avoid anything playful or consumer-startup-like (no confetti, no bright multi-color blends). This is a university system.
3. **Form inputs** — keep icon-prefixed inputs but increase polish: consider floating labels or a cleaner focus-ring treatment. Disabled/loading states must be visually distinct from default state, not just a lowered opacity (e.g. add a spinner, change border/background, or show a skeleton).
4. **Error banner** — keep accessible (icon + text, sufficient color contrast per WCAG AA), but tighten spacing/padding so it doesn't look like an oversized plain red box.
5. **Mobile (< md breakpoint)** — verify no wasted whitespace and appropriate padding/margins specifically at 375px and 414px viewport widths. Right now mobile only shows a small brand mark + form; make sure spacing feels intentional, not just a shrunk desktop layout.
6. **Initial mount** — add a subtle loading skeleton or fade-in transition while `authLoading` (or whatever the actual AuthContext loading flag is called) resolves, so there's no abrupt flash of content. This must wrap the *existing* loading condition — do not introduce a new loading state variable.

## PART 2 — New Landing.jsx
Public, static, no auth logic. Sections:

1. **Hero** — SRHU branding (reuse `logo-srhu.png`), one-line value proposition (reuse or lightly improve: "Manage campus events with clarity and control"), single primary CTA button linking to `/login`. No sign-up/register CTA unless Part 1's check of `Register.jsx` shows registration is genuinely public self-serve — default to omitting it.
2. **Feature highlights** — 3–4 cards describing *real* system capabilities pulled from the actual app (e.g. Create Event, Approval Workflow, Status Tracking, Role-based Dashboards). Do not invent generic SaaS marketing copy — base card copy on what the app's actual pages/components do. If unsure what a feature does, check the relevant page/component before writing copy for it.
3. **"How it works"** — reflect the actual workflow only: Teacher creates event → submits → Dean reviews → Approve/Reject → status visible to Teacher. Do not invent additional steps or roles.
4. **Footer** — SRHU name/branding only. No fake social icons, no fake legal/privacy links, no placeholder links to pages that don't exist.
5. **Responsive** — fully responsive at desktop and mobile widths.
6. **Visual cohesion** — reuse the exact color palette / gradient treatment decided in Part 1's Login redesign so Login and Landing read as one product, not two different design languages.

## App.jsx routing change
Only touch the route definitions:
- `"/"` → `<Landing />`
- `"/login"` → `<Login />`

Leave every other route, import order (besides adding the new import), and file structure untouched. Present this as a minimal diff.

## Deliverables I expect back
1. Full replacement content of `Login.jsx` (styling/JSX only — flag clearly if any existing logic line had to move, and why).
2. Full new `Landing.jsx`.
3. A **diff only** (not full file) for the `App.jsx` routing block.
4. A short written description (or screenshot if your tooling supports it) of the layout at:
   - Desktop: 1440px width
   - Mobile: 390px width
5. A short list of any assumptions you made (e.g. what `tailwind.config.js` contained, whether Register is role-restricted, what the AuthContext loading flag is named) so I can verify them against the real files.

## Before you finish
Re-check your own diff against the "Hard constraints" list above. If anything you wrote touches auth logic, adds a dependency, changes folder structure, or adds unrequested redirect logic, revert that part and flag it to me instead of shipping it.
