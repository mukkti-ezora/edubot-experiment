# EduBot console — UI contract (binding for all page work)

You are building pages of a redesigned multi-tenant admin console. **Read this fully before writing code.**

## Visual world (settled, do not deviate)

Cal.com's operational grammar applied to an institutional control plane: light ink-monochrome surfaces, hairline borders, **near-black primary buttons**, tinted semantic status chips, density as a feature, keyboard-first. Institutional identity comes from information hierarchy, not decoration.

**Bans:** no gradients, no glass/blur panels (except the topbar's existing backdrop), no rounded-card grids as page structure, no eyebrow/kicker labels above headings, no ALL-CAPS micro-labels (table headers stay sentence case), no unicode-glyph/emoji icons (use `@/components/icons`), no purple/blue "AI" accents, no decorative motion, no spinners as the only loading state (use skeletons), no cards nested inside cards, no fake/invented data — only API data.

**Voice:** sentence case everywhere. Buttons name the outcome ("Create institution", "Save changes"). Errors state what happened + what to do. Empty states teach (what this is, what to do next).

## Tokens (styles/tokens.css) — use variables, never raw hex

Surfaces: `--paper` (page bg #FAFAFA), `--surface` (white), `--surface-2` (#F4F4F5 wells/hover), `--surface-3`, `--surface-inset`.
Ink: `--ink-900` (headings/text), `--ink-800`, `--ink-700`, `--ink-600` (secondary), `--ink-500` (muted), `--ink-400` (icons/placeholders).
Lines: `--line`, `--line-strong`.
Action: near-black `--action`/`--action-hover`/`--action-active` (the Button component handles this).
Semantics: `--ok-*`, `--warn-*`, `--danger-*`, `--info-*`, `--violet-*` (700=text on tint, 100=border, 50=bg).
Radii: `--r-sm` 6px controls, `--r-md` 8px, `--r-lg` 12px cards/overlays, `--r-xl` 16px dialogs, `--r-full`.
Shadows: `--shadow-xs` (cards), `--shadow-sm` (popovers), `--shadow-lg` (menus), `--shadow-xl` (dialogs/drawers).
Type: `--font-ui` (Inter, everywhere console), `--font-serif` (landing/login only), `--font-mono` (codes/IDs). Sizes `--text-11..--text-38`.
Motion: `--ease-out`, `--dur-fast/base/slow`.

## React primitives (`@/components/ui`)

`Button` ({variant: primary|secondary|ghost|danger|danger-ghost, size: md|sm|xs, loading, icon}) · `IconButton` ({label required for a11y}) · `Badge`/`StatusPill`/`statusTone(status)` · `Avatar` ({name, size sm|md|lg, dark}) · `Ident` ({name, sub, size}) — avatar + 2-line identity cell for tables · `Field` ({label, htmlFor, help, error, children}) · `Tabs` ({tabs:[{id,label,count}], active, onChange}) · `Menu`/`MenuItem`/`MenuSep`/`MenuLabel` — `Menu` takes `trigger={<button/>}`, `align`, children menu items with `icon`, `onSelect`, `danger`, `hint` · `Drawer` ({title, sub, footer, onClose, children}) — right-side panel for forms · `ConfirmDialog` (title, body, confirmLabel, danger, busy, onConfirm, onClose) · `EmptyState` ({title, body, action, icon}) · `ErrorState` ({onRetry}) · `Alert` ({tone: info|warn|danger|ok, title, children}) · `PageHead` ({title, sub, actions}) · `SkeletonRows`, `Skeleton`, `Spinner`.

Icons live in `@/components/icons` (IconDashboard, IconBuilding, IconUsers, IconUser, IconUserPlus, IconKey, IconShield, IconShieldCheck, IconActivity, IconSettings, IconSearch, IconChevronDown/Right/Left/UpDown, IconPlus, IconX, IconCheck, IconCheckCircle, IconAlertTriangle, IconAlertCircle, IconInfo, IconMenu, IconDots, IconLogout, IconClock, IconGlobe, IconMail, IconArrowUpRight, IconArrowRight/Left/Up/Down, IconFilter, IconInbox, IconEye, IconPencil, IconRefresh, IconBan, IconCalendar, IconFileText, IconHome, IconHash, IconLock, IconSend, IconCircleDot, IconBook, IconCopy).

## DataTable (`@/components/DataTable`)

columns: `{key, label, width?, align?: "left"|"right", render(row)}`; props: rows, keyOf, loading, error, onRetry, sort, onSort, sortable:Set<string>, onRowClick, empty, nextCursor, onNext, onPrev, pageIndex, countLabel, **toolbar?: ReactNode** (rendered above the table inside the bordered shell — put your FilterBar there). Row actions go in a right-aligned final column using `Menu` + `IconButton label="Row actions"` (dots icon). Identity cells use `Ident`. Status cells use `StatusPill`. Dates: `formatDate/relativeFromNow` from `@/lib/format`.

Filter bars: `<div className="filterbar">` with `<div className="search-wrap">` (IconSearch + input.input), `.select`, and filter chips `<button className="fchip" data-active={bool}>Label n<svg or ×…>`. Show an active-filter count chip and a "Clear" ghost button when filters are set. All state via `useTableState` (URL-persisted) — never useState for list state.

Deep links you MUST honor: `?create=1` on /institutions and /roles opens the create dialog; `?invite=1` on /administrators opens the invite drawer. Consume and clear the param after opening.

## Data & auth

`@/lib/api` (`api<T>(path, init?)`, `qs()`), `@/lib/auth` (`useAuth()`: me, can(perm), signOut), `@/lib/toast` (`useToast().notify(msg, "ok"|"error")`), `@/lib/types` (Page, Institution, UserRow, Permission, RoleSummary, RoleDetail, AuditEvent, DashboardSummary, InstitutionOverview, PlatformSettings, MeResponse). **Do not modify lib/ files or the backend.** If an ideal UI wants data the API does not expose, approximate from existing fields and note the gap in your final report.

Existing page files are the source of truth for which endpoints exist and how queries/mutations are wired — preserve those API calls and permission gates; redesign the presentation and interaction. Cache invalidation via TanStack `queryClient.invalidateQueries` as the old code does.

## Styling your page

Each page imports exactly one new stylesheet: `import "@/styles/pages/<page>.css"`; scope all page rules under `.page-<name>` (e.g. `.page-dashboard …`) to avoid collisions. Compose from primitives classes first; page CSS is for layout composition and page-specific widgets only. Buttons/inputs/menus/dialogs/cards/tables must NOT be re-styled locally.

Density targets: tables 13px / 46px rows, page padding handled by shell (.content), max content width 1280px. Forms in Drawer or Dialog, not new pages. Responsive: pages must compose at 360px wide without horizontal overflow (tables may scroll internally).

Motion: 120–260ms ease-out-expo on state changes only. No entrance choreography on console pages. Respect prefers-reduced-motion (global CSS already zeroes durations — don't fight it).

Accessibility: keyboard-complete (tab order, Enter/Space on interactive, Escape closes overlays), visible focus (built into global :focus-visible), aria labels on icon-only buttons via IconButton/aria-label, status never by color alone (Badge has dot + text).

## Definition of done (per page)

1. `npx tsc --noEmit` passes (run from apps/web).
2. All old page functionality preserved (mutations, pagination, sorting, filters) and new brief requirements implemented.
3. Loading = skeletons; error = ErrorState w/ retry; empty = EmptyState teaching.
4. Report: what you changed, which API gaps you hit, anything you approximated.
