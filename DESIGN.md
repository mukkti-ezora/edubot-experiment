---
name: EduBot
description: One platform for institutional management and learning. Cool neutrals, one calibrated orange, Geist throughout.
colors:
  brand-50: "#fdf1eb"
  brand-100: "#fadfd1"
  brand-500: "#d9622a"
  brand-600: "#c4511f"
  brand-strong: "#a9441a"
  brand-700: "#a9441a"
  on-brand: "#ffffff"
  surface-0: "#ffffff"
  surface-1: "#ffffff"
  surface-2: "#f6f7f9"
  surface-3: "#eef0f3"
  neutral-900: "#0f172a"
  neutral-800: "#1e293b"
  neutral-700: "#334155"
  neutral-600: "#475569"
  neutral-500: "#64748b"
  neutral-400: "#94a3b8"
  neutral-300: "#cbd5e1"
  border-subtle: "#e4e4e7"
  border-default: "#d4d4d8"
  border-strong: "#a1a1aa"
  success-50: "#f2f9f4"
  success-600: "#2e7a40"
  success-700: "#266435"
  warning-50: "#fdf9f0"
  warning-600: "#a87418"
  warning-700: "#886014"
  danger-50: "#fdf3f3"
  danger-600: "#ab2f2f"
  danger-700: "#8f2626"
  info-50: "#f1f5fb"
  info-600: "#3766a8"
  info-700: "#2d548a"
  student-50: "#f4f9f5"
  student-600: "#3a7548"
  student-700: "#305e3b"
  teacher-50: "#f3f6fa"
  teacher-600: "#3b6089"
  teacher-700: "#324f70"
  parent-50: "#faf7f3"
  parent-600: "#9a6e45"
  parent-700: "#7f5a3a"
  admin-50: "#f6f5f9"
  admin-600: "#6b5f88"
  admin-700: "#594f70"
  institution-50: "#faf5f6"
  institution-600: "#8b5764"
  institution-700: "#744954"
  lp-ink: "#0e1116"
  lp-ink-2: "#3a4250"
  lp-muted: "#5b6472"
  lp-line: "#e6e8ec"
  lp-line-strong: "#d5d9e0"
  lp-accent-soft: "#fbede6"
  lp-ok: "#2e7d46"
  lp-danger: "#b4372f"
typography:
  display:
    fontFamily: "Geist Variable, Geist, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif"
    fontSize: "clamp(2.6rem, 2.4vw + 1.3rem, 3.75rem)"
    fontWeight: 600
    lineHeight: 1.02
    letterSpacing: "-0.038em"
  headline:
    fontFamily: "Geist Variable, Geist, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif"
    fontSize: "clamp(2rem, 2vw + 1.2rem, 3rem)"
    fontWeight: 600
    lineHeight: 1.08
    letterSpacing: "-0.032em"
  page-title:
    fontFamily: "Geist Variable, Geist, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif"
    fontSize: "1.875rem"
    fontWeight: 600
    lineHeight: 1.1
    letterSpacing: "-0.02em"
  section-title:
    fontFamily: "Geist Variable, Geist, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif"
    fontSize: "1.5rem"
    fontWeight: 700
    lineHeight: 1.1
    letterSpacing: "-0.02em"
  title:
    fontFamily: "Geist Variable, Geist, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif"
    fontSize: "1rem"
    fontWeight: 600
    lineHeight: 1.3
    letterSpacing: "-0.01em"
  metric:
    fontFamily: "Geist Variable, Geist, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif"
    fontSize: "1.5rem"
    fontWeight: 700
    lineHeight: 1
    letterSpacing: "-0.03em"
    fontFeature: "\"tnum\" 1"
  body:
    fontFamily: "Geist Variable, Geist, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.5
    fontFeature: "\"cv11\" 1, \"ss01\" 1"
  body-landing:
    fontFamily: "Geist Variable, Geist, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.6
  lead:
    fontFamily: "Geist Variable, Geist, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif"
    fontSize: "1.125rem"
    fontWeight: 400
    lineHeight: 1.6
  label:
    fontFamily: "Geist Variable, Geist, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 600
    lineHeight: 1.25
  mono:
    fontFamily: "Geist Mono Variable, SFMono-Regular, ui-monospace, monospace"
    fontSize: "0.92em"
    fontWeight: 400
  mono-landing:
    fontFamily: "Geist Mono Variable, SFMono-Regular, ui-monospace, monospace"
    fontSize: "0.75rem"
    fontWeight: 400
    letterSpacing: "0.02em"
rounded:
  xs: "3px"
  sm: "4px"
  md: "6px"
  lg: "8px"
  xl: "10px"
  2xl: "12px"
  full: "9999px"
  lp: "8px"
spacing:
  "1": "4px"
  "2": "8px"
  "3": "12px"
  "4": "16px"
  "5": "20px"
  "6": "24px"
  "8": "32px"
  "10": "40px"
  "12": "48px"
  "16": "64px"
  "20": "80px"
  "24": "96px"
  content-padding: "32px"
  lp-gutter: "clamp(20px, 4vw, 48px)"
  lp-section: "clamp(88px, 10vw, 144px)"
components:
  button-primary:
    backgroundColor: "{colors.brand-600}"
    textColor: "{colors.on-brand}"
    typography: "{typography.label}"
    rounded: "{rounded.md}"
    padding: "0 20px"
    height: "40px"
  button-primary-hover:
    backgroundColor: "{colors.brand-strong}"
    textColor: "{colors.on-brand}"
  button-secondary:
    backgroundColor: "{colors.surface-0}"
    textColor: "{colors.neutral-800}"
    rounded: "{rounded.md}"
    padding: "0 20px"
    height: "40px"
  button-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.neutral-600}"
    rounded: "{rounded.md}"
    height: "40px"
  button-ghost-hover:
    backgroundColor: "{colors.surface-2}"
    textColor: "{colors.neutral-900}"
  button-danger:
    backgroundColor: "{colors.danger-600}"
    textColor: "#ffffff"
    rounded: "{rounded.md}"
    height: "40px"
  button-sm:
    rounded: "{rounded.sm}"
    padding: "0 14px"
    height: "32px"
  input:
    backgroundColor: "{colors.surface-0}"
    textColor: "{colors.neutral-900}"
    typography: "{typography.body}"
    rounded: "{rounded.md}"
    padding: "0 12px"
    height: "40px"
  badge-ok:
    backgroundColor: "{colors.success-50}"
    textColor: "{colors.success-700}"
    typography: "{typography.label}"
    rounded: "{rounded.full}"
    padding: "4px 10px"
  badge-warn:
    backgroundColor: "{colors.warning-50}"
    textColor: "{colors.warning-700}"
    rounded: "{rounded.full}"
    padding: "4px 10px"
  badge-danger:
    backgroundColor: "{colors.danger-50}"
    textColor: "{colors.danger-700}"
    rounded: "{rounded.full}"
    padding: "4px 10px"
  badge-student:
    backgroundColor: "{colors.student-50}"
    textColor: "{colors.student-700}"
    rounded: "{rounded.full}"
    padding: "4px 10px"
  panel:
    backgroundColor: "{colors.surface-0}"
    rounded: "{rounded.lg}"
    padding: "20px"
  metric-cell:
    backgroundColor: "{colors.surface-0}"
    typography: "{typography.metric}"
    padding: "16px 18px"
  nav-item:
    textColor: "{colors.neutral-600}"
    typography: "{typography.body}"
    rounded: "{rounded.md}"
    padding: "0 10px"
    height: "38px"
  nav-item-active:
    backgroundColor: "{colors.surface-0}"
    textColor: "{colors.neutral-900}"
  table-header:
    backgroundColor: "{colors.surface-1}"
    textColor: "{colors.neutral-500}"
    typography: "{typography.label}"
    padding: "14px 16px"
  table-row:
    textColor: "{colors.neutral-700}"
    typography: "{typography.body}"
    padding: "12px 16px"
    height: "52px"
  landing-button-primary:
    backgroundColor: "{colors.brand-600}"
    textColor: "{colors.on-brand}"
    rounded: "{rounded.lp}"
    padding: "0 22px"
    height: "48px"
  landing-button-secondary:
    backgroundColor: "{colors.surface-0}"
    textColor: "{colors.lp-ink}"
    rounded: "{rounded.lp}"
    padding: "0 22px"
    height: "48px"
---

# Design System: EduBot

## Overview

**Creative North Star: "The Calibrated Console"**

EduBot looks like the category standard for a modern B2B education platform, finished to Stripe's level of craft without borrowing Stripe's look. The product itself carries the identity. Cool slate neutrals hold the ground, one EduBot orange marks what you can act on, and Geist sets everything from a 60px landing headline down to a 12px table header. The interface reads as a precise instrument for running institutions: dense tables, hairline-divided metric strips, tabular numerals, and status colour that always comes with a word or an icon.

There are two modes inside one identity. The admin console and the student, teacher and parent portals are **Operate**: 14px body text, 40px controls, 52px table rows, hairline borders, almost no motion. The public landing page is **Persuade**. It keeps the same palette, type family and component vocabulary but opens up the scale (16px body, fluid display type, `clamp(88px, 10vw, 144px)` section rhythm). Its hero is the real console built from production components and fed labelled demo data, not a screenshot. The landing's scoped `--lp-*` tokens mirror the global ones and never leak into the console.

Light mode is the default and dark mode follows the system unless a choice is stored. Dark mode is designed separately rather than inverted. Surfaces drop to near-black cool greys (`#0b0d10` / `#12151a` / `#181c22`). The orange is re-tuned to `#ff8a4c` and its text flips to ink (`#0e1116`). Every tinted fill is derived with `color-mix` so it sits on the dark surface instead of glowing.

**Key Characteristics:**
- Cool neutral ground, one contrast-calibrated orange accent, five muted role hues for entity identity
- Geist Variable for UI and display; mono only for data, IDs and codes
- Hairline 1px borders and near-flat surfaces; real elevation only for overlays and the landing console frame
- 6px controls, 8px panels, pill-shaped badges and chips
- Motion signals state changes or is scrubbed to scroll; it is never a scroll-reveal fade, and reduced motion is respected everywhere

## Colors

The palette is restrained: cool slate neutrals, one orange that means "act here", and five desaturated role hues that tell you who a record belongs to.

### Primary
- **EduBot Orange** (`brand-600`): primary buttons, active filter chips, checked checkboxes and switches, the active tab underline, the sidebar's active-item indicator, the brand mark, and the focus ring (as `rgba(255,120,45,0.3)`). In dark mode it becomes `#ff8a4c`.
- **Burnt Orange** (`brand-strong`): hover fill and border for primary buttons. Unlike `brand-700`, it stays the same across themes (dark: `#ff9e6a`).
- **Orange Wash** (`brand-50`, `brand-100`): the selected row in the command palette, hover on clickable table rows, and brand-toned badges and panels. In dark mode it is derived as `color-mix(brand-500 14% / 26%, surface-1)`.
- **On-Brand** (`on-brand`): the only text colour allowed on an orange fill. It is white in light mode and ink `#0e1116` in dark mode.

### Secondary: Role Hues
Each category has a full 50 to 950 scale in `tokens.css`. Its job is identity, not decoration.
- **Sage** (`student-600`): students.
- **Steel Blue** (`teacher-600`): teachers.
- **Warm Clay** (`parent-600`): parents.
- **Slate Violet** (`admin-600`): administrators.
- **Dusty Rose** (`institution-600`): institutions.

Each role hue drives the matching avatar fill, badge (`-50` fill, `-700` text, `-100` border), nav accent, filter chip and role-portal chrome. The role portals pass their hue in through `--role-50/600/700`.

### Tertiary: Status
- **Success** (`success-600`), **Warning** (`warning-600`), **Danger** (`danger-600`), **Info** (`info-600`). Badges and alerts use the tinted pair (`-50` fill, `-700` text). Deltas and trend glyphs use `-600`. In dark mode the `-50`, `-100` and `-700` steps are derived from `-500` with `color-mix` (14%, 26%, and 60% toward white).

### Neutral
- **Ink** (`neutral-900`): primary text and headings. In dark mode the whole neutral scale inverts (`neutral-900` becomes `#f1f5f9`).
- **Slate Body** (`neutral-700`, `neutral-600`): table cell text and secondary copy.
- **Slate Meta** (`neutral-500`): sub-lines, labels, table headers and timestamps.
- **Slate Quiet** (`neutral-400`): icons at rest and placeholders. Do not use it for readable text.
- **Paper** (`surface-0` / `surface-1`): page and card ground. **Well** (`surface-2`): segmented-control tracks, skeleton shimmer, role-table heads and ghost hover. **Well Deep** (`surface-3`).
- **Hairlines** (`border-subtle`, `border-default`, `border-strong`): rest, hover and emphasis, in that order.
- **Landing ink set** (`lp-ink`, `lp-ink-2`, `lp-muted`, `lp-line`, `lp-line-strong`): the Persuade surface's mirror of the neutrals, scoped to `.lp`. `lp-ok` and `lp-danger` colour the audit stream and hero network.

### Named Rules
**The Calibrated Orange Rule.** Orange fills use `brand-600` and their text uses `--on-brand`. Never hard-code white on orange, because in dark mode the accent brightens and its text has to flip to ink.

**The One Accent Rule.** Orange appears only on primary action, live state, the active or selected indicator, and focus. On the landing page it is limited to primary action, live state and focus. Role hues identify entities; they never act as a second brand colour.

**The Derived Tint Rule.** Dark-mode tints are computed with `color-mix(in srgb, <hue>-500 N%, var(--surface-1))`. Do not hand-pick dark tint hexes.

**The Never-Colour-Alone Rule.** Every status or role colour comes with a text label or an icon.

## Typography

**Display Font:** Geist Variable (fallback: -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif)
**Body Font:** Geist Variable
**Mono Font:** Geist Mono Variable everywhere (`--font-mono` in the console, `--lp-mono` on the landing page)

**Character:** A single neo-grotesque runs the whole system. Hierarchy comes from size, weight (400/500/600/700) and tight negative tracking on large sizes, not from a second typeface. Stylistic sets `cv11` and `ss01` are on throughout the app.

### Hierarchy
- **Display** (600, `clamp(2.6rem, 2.4vw + 1.3rem, 3.75rem)`, line-height 1.02, -0.038em, balanced wrap): the landing hero headline only.
- **Headline** (600, `clamp(2rem, 2vw + 1.2rem, 3rem)`, 1.08, -0.032em): landing section heads. The closing call-to-action goes up to `clamp(2.25rem, 3vw + 1rem, 3.75rem)`.
- **Page Title** (600, 30px, 1.1, -0.02em): the console page heading, with a 16px sub-line capped at 72ch.
- **Section Title** (700, 24px, -0.02em): section heads inside console pages.
- **Title** (600, 16px): panel heads, dialog and drawer titles (dialogs and drawers use 18px at 700), and role-dashboard section titles.
- **Metric** (700, 24px, line-height 1, -0.03em, tabular): metric strip values. The larger tile value is 36px.
- **Body** (400, 14px, 1.5): all console text. Table cells are 14px. Prose is capped between 52ch (empty states) and 72ch (page subtitles).
- **Body Landing / Lead** (16px at 1.6 / 18px at 1.6, capped at 60ch): landing copy.
- **Label** (500 to 600, 12px): sub-lines, badges, chips and meta text. Table column headers and sidebar group labels use uppercase at +0.05em tracking. That is the only uppercase in the console.
- **Mono** (0.92em): institution codes, record IDs, correlation values, timetable rooms and capability keys.

### Named Rules
**The One Family Rule.** Geist sets everything a person reads. Mono appears only where the content is machine data: IDs, codes, permission keys, counts in the audit stream. No serif anywhere in the product.

**The Tabular Rule.** Every number that can change or be compared (metrics, counts, deltas, table numerals, pagination) uses `font-variant-numeric: tabular-nums`.

## Layout

The console is a two-column grid: a 260px sidebar next to a fluid main column. The main column has a sticky 56px top bar, and content sits inside a `max-width: 1440px` container with `28px 32px 48px` padding. At 1100px and below, the sidebar collapses to a 72px icon rail. At 760px and below, it becomes a 300px off-canvas drawer with a scrim, and content padding drops to 20px. The role portals use the same structure in `role-shell.css`.

Spacing follows a 4px base (4, 8, 12, 16, 20, 24, 32, 40, 48, 64, 80, 96). The typical gaps are 16px between panels, 20px of panel padding, 24px below a page header, and 28px above a section head. Metric strips are hairline-divided rows: a 1px grid gap over a `border-subtle` background inside a single 6px-radius container. They run 6 columns, then 3 at 1100px and below. Role dashboards run 4 columns, and two-column grids use `repeat(auto-fit, minmax(400px, 1fr))`. Tables scroll horizontally inside their shell rather than turning into cards.

The landing page uses a 1240px max width, `clamp(20px, 4vw, 48px)` gutters and `clamp(88px, 10vw, 144px)` between sections. The hero splits into copy plus a 460px network visual. Below it, full width, sits the live console frame. Feature sections use 5/7 asymmetric splits with a sticky intro column. Everything stacks to one column at 1024px (sections) and 1100px (hero).

## Elevation & Depth

The system is hairline-first with ambient shadows. At rest, surfaces separate by a 1px `border-subtle` line plus a barely visible `shadow-xs` and a 1px inner top highlight. Shadow depth grows only with state or layer: hover lifts a panel to `shadow-md`, menus sit at `shadow-xl`, and dialogs, drawers, the command palette and toasts use `shadow-2xl`. All shadows are tinted slate (`rgb(15 23 42 / …)`) and stacked in multiple layers. In dark mode they become black at higher opacity.

### Shadow Vocabulary
- **Rest** (`shadow-xs` + `shadow-inner-highlight`): panels, table shells, secondary buttons, the active segmented option.
- **Raised** (`shadow-sm` / `shadow-md`): primary button at rest and on hover, and panel hover.
- **Floating** (`shadow-xl`): menus and dropdowns.
- **Overlay** (`shadow-2xl`): dialogs, drawers, the command palette, toasts, and the open mobile sidebar.
- **Console Frame** (`lp-frame-shadow`): the landing's live console. Its long, soft offset drop marks it as the one object on the page.
- **Focus** (`focus-ring`, a 3px orange halo): every focusable element in the console. The landing page uses a 2px orange outline with a 3px offset.

### Named Rules
**The Hairline First Rule.** A 1px line separates things. A shadow says something is above the page. Do not use shadows to group content that a border already groups.

**The One Frame Rule.** On the landing page, only the live console frame casts a large shadow. Everything else on that surface is flat with hairlines.

## Shapes

Corners are gently curved and stay small. Radii run 3px (code, kbd), 4px (small buttons, checkboxes, skeletons), 6px (default buttons, inputs, nav items, metric strips, menu items), 8px (panels, table shells, menus, drawers, landing panels and buttons), and 10 to 12px (metric tiles, dialogs, the command palette). Full pills are reserved for badges, filter chips, count pills, avatars, switches, segmented role tabs and the landing's segmented control. Borders are 1px everywhere except the 2px active-tab underline and the 3px active-nav indicator bar.

## Components

### Buttons
Buttons feel solid and decisive.
- **Shape:** 6px radius at 40px tall; 4px radius at 32px (`btn-sm`) and 26px (`btn-xs`). Icon buttons are square at the same heights. Icons are 16px.
- **Primary:** an orange fill with on-brand text, a 1px `brand-strong` border, and `shadow-sm` plus the inner highlight. 600 weight, 14px.
- **Hover / Focus / Active:** hover deepens to `brand-strong` and raises to `shadow-md`. Active presses to `scale(0.97)`. Focus shows the 3px orange ring. Disabled drops to 55% opacity with no pointer events. Loading swaps in an inline 16px spinner.
- **Secondary / Ghost / Danger:** secondary is a white fill with a `border-default` line that strengthens on hover. Ghost is transparent with slate text and fills with `surface-2` on hover. Danger is a `danger-600` fill; danger-ghost is red text that picks up a `danger-50` wash.
- **Landing:** 48px tall, 8px radius, 22px horizontal padding. The primary arrow nudges 3px right on hover and the button presses 1px down when active.

### Chips and Badges
- **Badges:** 12px at weight 600, full pill, `4px 10px` padding, with tinted fill, `-700` text and `-100` border. There are tones for each status, each role, brand, neutral and outline.
- **Filter chips:** 32px white pills. When active they fill solid with orange, or with the role hue for role filters.
- **Count pills:** a 20px `surface-2` pill with bold tabular text.

### Cards / Containers
- **Corner Style:** 8px panels, 10px metric tiles.
- **Background:** `surface-0` on a `surface-1` page.
- **Shadow Strategy:** Rest at idle and Raised on hover (see Elevation).
- **Border:** 1px `border-subtle`, moving to `border-default` on hover.
- **Internal Padding:** 20px. Panel heads are `16px 20px` with a hairline below.

### Inputs / Fields
- **Style:** 40px tall, 6px radius, 1px `border-default` line, white fill, 12px side padding. Search fields carry an 18px leading icon and a trailing kbd hint.
- **Focus:** the border turns `brand-500` and the 3px orange ring appears.
- **Error / Disabled:** `aria-invalid` turns the border `danger-500`, and the error text below is 12px `danger-600` with an icon. Disabled fields fill with `surface-2` and slate-400 text.
- **Labels:** above the field at 14px/500, with 12px help text beneath.

### Navigation
- **Sidebar:** 260px wide. The brand mark is a 34px orange square holding the "E", next to the wordmark. Nav items are 38px tall with 6px radius, an 18px icon and a 14px/500 label. Hover and active fill with `surface-0` plus `shadow-xs`. The active item also gets a 3px accent bar on the left edge and an accent-coloured icon. The accent is orange for platform sections and the role hue for role sections and portals.
- **Top bar:** 56px, sticky, with a hairline bottom border. It holds breadcrumbs, the command palette trigger (with a `⌘K` kbd hint) and the theme toggle.
- **Mobile:** the sidebar becomes an off-canvas drawer opened by a menu button.

### Data Table (signature)
The table is the console's core instrument. It sits in an 8px shell with a hairline border. The sticky header uses `surface-1` with uppercase 12px slate-500 labels. Rows are 52px with hairline separators. Hover washes the row `surface-1`, or `brand-50` for clickable rows, and keyboard focus shows a 3px inset orange bar. Primary cells are 600-weight ink with a 12px slate sub-line, IDs are set in mono, numbers are tabular, and actions are right-aligned. The footer carries the tabular count and pagination.

### Metric Strip (signature)
A single row of cells separated by 1px hairlines inside one 6px container. Each cell has a 24px/700 tabular value, a 14px slate label and a 12px delta, with `16px 18px` padding. Hover fills the cell with `surface-1`. A warning metric turns its value `warning-700`.

### Live Console Frame (landing signature)
The real role dashboards render inside an 8px frame with a `lp-line-strong` border and `lp-frame-shadow`. A 52px app bar holds the mark, a pill role switcher and a dashed mono "Demo data" tag. Below it, a 208px rail sits next to the content. The role switcher moves its pill with a spring (stiffness 420, damping 36). Views cross-fade in 320ms with an 8px rise and a 4px blur. The console autoplays through the four roles until the visitor picks one, and never autoplays under reduced motion. A 2px orange progress line tracks the autoplay.

### Hero Institution Network (landing signature)
An SVG of the 18 demo institutions orbiting an orange EduBot hub. Nodes are coloured by real status (active, pending, suspended) and labelled in 10px mono. Audited events travel as orange pulses toward the hub. The motion runs on GSAP (expo-out intro, 160s and 110s counter-rotating orbits), and the network is static under reduced motion.

## Do's and Don'ts

### Do:
- **Do** pair every orange fill with `--on-brand` text, and use `brand-strong` for hover.
- **Do** separate surfaces with 1px `border-subtle` hairlines first. Save `shadow-xl` and `shadow-2xl` for menus, dialogs, drawers, the command palette and toasts.
- **Do** set every comparable number in tabular numerals, and every ID, code or permission key in mono.
- **Do** use the role hues (sage, steel, clay, violet, rose) only to identify students, teachers, parents, admins and institutions, always with a label or icon.
- **Do** derive dark-mode tints with `color-mix` from the `-500` step against `surface-1`.
- **Do** use Phosphor icons through `components/icons.tsx` at regular weight in the console: 16px in buttons, 18px in nav and search.
- **Do** tie motion to state changes (tab pill spring, view cross-fade, audit-row insert, menu and dialog entry at 180 to 300ms on `cubic-bezier(0.16, 1, 0.3, 1)`), or scrub it to scroll with GSAP ScrollTrigger, and gate all of it behind `prefers-reduced-motion: no-preference`.
- **Do** keep content visible by default, without JavaScript timing. Scroll-linked effects only add to content that is already readable.
- **Do** label demo data as demo data wherever the product is shown.

### Don't:
- **Don't** fade or slide sections in on scroll.
- **Don't** use a serif typeface, Inter, or a second display face. Geist carries display and UI.
- **Don't** use Lucide or mix icon families. Phosphor is the only set.
- **Don't** use gradient text, purple-to-blue gradients, or gradient washes behind content.
- **Don't** build glassmorphism cards or translucent blurred panels.
- **Don't** mark cards with a coloured left border.
- **Don't** put a badge or eyebrow label above a headline, or set three icon boxes in a row.
- **Don't** add a second accent colour or use role hues decoratively.
- **Don't** hard-code `#fff` text on orange or on tinted fills. It fails in dark mode.
- **Don't** convey status by colour alone.
