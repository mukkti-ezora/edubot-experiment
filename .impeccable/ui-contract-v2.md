# EduBot v2 — UI CONTRACT (binding; read fully before writing code)

You are building pages of a **premium education platform console** (React 18 + TS + Vite, hand-rolled CSS). This replaces the previous ink-monochrome system. Stack: existing components in `apps/web/src/components/`, CSS custom properties, NO new npm deps, NO Tailwind.

## Product truth (changed)

"Users" is no longer a product concept. People are **Students / Teachers / Parents / Administrators** — first-class, with dedicated pages, colors, icons, and copy. The backend still has one User entity; the frontend calls the same `GET /api/v1/users?type=student|teacher|parent` endpoints (list/detail/mutations unchanged). Institutions remain.

## Category identity system (locked)

| Category | CSS var family | Gradient | Icon | Feel |
|---|---|---|---|---|
| Platform brand | `--brand-*` (indigo) | `--gradient-brand` | IconSparkles/IconDashboard | the platform's own voice; primary buttons |
| Students | `--student-*` (emerald) | `--gradient-student` | IconGraduationCap | growth, learning |
| Teachers | `--teacher-*` (sky) | `--gradient-teacher` | IconBookOpen | clarity, knowledge |
| Parents | `--parent-*` (amber) | `--gradient-parent` | IconHeart | warmth, community |
| Administrators | `--admin-*` (violet) | `--gradient-admin` | IconShieldCheck | governance, authority |
| Institutions | `--institution-*` (rose) | `--gradient-institution` | IconBuilding | identity, belonging |

Color RULES (taste-skill): each color has a purpose — category identity, status, or primary action. Never decoration-only. One family per component context; never mix families inside one visual unit. Primary buttons = `--brand-600` (indigo), hover `--brand-700`. Gradients allowed ONLY: category icon chips, hero bands, avatar fills — never body backgrounds, never text fills.

New icons exist in `@/components/icons`: IconGraduationCap, IconBookOpen, IconHeart, IconSparkles, IconSchool, IconTrendingUp, IconArrowUpRight (plus all previous ones).

## Available primitives (styles/primitives.css + components/ui.tsx)

Existing classes keep their names (`.btn .btn-primary .input .field .badge .card .tabs .tab .menu .menu-item .dialog .drawer .alert .skeleton .empty .errorbox .table-shell .filterbar .fchip .ident .avatar .metric .delta .distbar .timeline .tl-* .rowlist .page-head .crumbs .kv`) but are RESTYLED — do not redefine them in page CSS.

**New category-aware primitives:**
- `Avatar` now takes `category?: "student"|"teacher"|"parent"|"admin"|"institution"` → gradient background + white initials. `AvatarGroup` renders overlapping stack.
- `Badge`/`StatusPill` support category tones: `.badge-student .badge-teacher .badge-parent .badge-admin .badge-institution .badge-brand`.
- `MetricTile` — the dashboard/library stat block: `{label, value, delta?, category, icon, to?}` → `.tile .tile-cat` (white rounded-xl, gradient icon chip, big tnum value, colored hover shadow + lift).
- `SectionHead` — `{title, sub?, action?, category?}` → `.section-head` with optional category-colored title accent.
- `PersonCard`, `InstitutionCard`, `ChartPanel` — `.person-card`, `.inst-card`, `.chart-panel` (built by the Institutions/dashboard work; check primitives.css before re-rolling).
- Distribution bars: `.catbar` (stacked per-category composition), `.bar-row` (labeled horizontal bar).

## Design dials (taste-skill: VARIANCE 7 / MOTION 5 / DENSITY 5)

- Layouts must vary: NOT every section a white card. Mix full-width panels, split grids, tinted surfaces (`.panel-tint-student` = `--student-50` etc.), gradient hero bands, chart panels, timelines.
- Shape lock: cards/panels `--radius-lg` (12px), controls `--radius-md` (8px), badges/pills `--radius-full`. No mixed systems.
- Motion: 120–300ms `--transition-*` on transform/opacity/background-color/border-color/shadow ONLY. **`transition: all` is BANNED** (Vercel rule). Hover lift: `translateY(-2px)` + stronger shadow; `:active` gets `translateY(0)` (tactile). All motion dies under `prefers-reduced-motion` (global rule exists).
- Hover states required on every interactive element; hover must INCREASE contrast.
- Empty states must be beautiful + teach (icon in tinted circle, one fact, one action). Loading = skeletons matching layout. Errors = `ErrorState` w/ retry.

## Hard rules (both skills — violations are build failures)

1. **A11y:** icon-only buttons need `aria-label`; form controls have `<label htmlFor>`; decorative SVGs `aria-hidden`; `<button>` for actions, `<Link>` for navigation — NEVER `<div onClick>`; async feedback in `aria-live="polite"` regions; tables keep real `<th scope>`; status never color-alone (dot/text included).
2. **Forms:** `autocomplete` + meaningful `name`; correct `type`; labels clickable; errors inline next to fields; submit enabled until request starts (spinner during); placeholders end with `…`; `spellCheck={false}` on emails.
3. **Typography:** real `…` not `...`; curly quotes in copy; tabular-nums on all number columns (`.tnum`); `Intl.*` for dates/numbers via `@/lib/format`; Title Case buttons; active voice; specific labels ("Save changes" not "Continue"); numerals for counts ("8 deployments").
4. **Interaction:** URL reflects state (use `useTableState` — filters/sort/pagination in query params); destructive actions confirm via `ConfirmDialog`; `touch-action: manipulation` on interactive elements (already global); drawers/dialogs `overscroll-behavior: contain` (in CSS already).
5. **Content:** flex children with text get `min-w-0` + truncate helpers; handle empty/long strings; no lorem, no fake data — API data only.
6. **No eyebrow spam:** max one small-caps-style label per 3 sections. Headings speak for themselves.
7. **No `transition: all`, no `outline-none` without focus replacement, no emoji as icons, no gradient text, no glass on body content.**

## Data (unchanged endpoints)

`@/lib/types.ts` — `UserRow.type` is "student"|"teacher"|"parent"|"administrator". List: `GET /api/v1/users?type=<t>&query=&status=&institutionId=&sort=&cursor=` (Page keyset). Detail: `GET /api/v1/users/:id`. Mutations: activate/deactivate same. Dashboard summary: `GET /api/v1/dashboard/summary` (institutions.byStatus, users.byType, new/prior deltas, attention, recentActivity, institutionActivity). NEW (may still be in flight — degrade gracefully to dashboard summary totals): `GET /api/v1/people/stats` → `{ byType: { student: { total, byStatus: {active,invited,suspended,deactivated} }, … }, byInstitution: { student: [{institutionId, institutionName, count}], … } }`. If it 404s, show only what exists; never fake.

## Page rules

- Scope all page CSS under `.page-<name>`; import `@/styles/pages/<name>.css` from the page.
- PageHead pattern: `SectionHead`-style header with big title (18–24px), category-colored where the page IS a category (Students page title can carry an emerald accent — icon chip, not full-color text).
- Category pages (Students/Teachers/Parents) MUST feel like siblings, not clones: shared skeleton, different hierarchy emphasis, empty-state copy, and filter defaults per audience.

## Definition of done

1. `cd apps/web && npx tsc --noEmit` passes.
2. All old functionality preserved (mutations, URL state, permissions via `can()`).
3. Loading/empty/error states present per above.
4. Report: files changed, decisions, API gaps, approximations.
