# EduBot Design Language

Mode discipline (impeccable): console surfaces = **Operate**; landing = **Persuade** within the same identity. Persuade tokens never leak into the console.

## Direction

The visual world is **institutional record-keeping done with modern precision** — the registrar's ledger, archival classification, academic documents that carry legal weight. Mechanism as identity: the interface itself (typed records, rules, statuses) is the ornament. Motto for calibration: *precision you can trust with ten thousand students.*

Deliberately rejected defaults (per frontend-design slop audit): cream+serif+terracotta "warm academia", near-black+neon "AI lab", SaaS rounded-card kit, gradient washes, glassmorphism, eyebrow labels, all-caps micro-labels, numbered "01/02/03" decorations, purple/blue AI palettes, Linear/Stripe/Vercel cloning.

## Type

- **Public Sans** (variable) — the entire console: headings, body, controls, data. tabular figures (`tnum`) for all numeric data.
- **Source Serif 4** (variable) — landing display only; console uses sans headings.
- **Source Code Pro** — record codes (`EB-…`, `ASHF-…`), IDs, correlation values.
- Scale (rem): `12, 13, 14(base), 16, 20, 24, 30, 38`. Console density: base 14, tables 13, line-height 1.45 body / 1.2 display. Measure: prose ≤ 72ch.

## Color

Restrained strategy: cool ink neutrals + **one** pine accent. Values are contract — new colors need a reason and a state mapping.

| Token | Value | Use |
|---|---|---|
| `--paper` | `#FBFCFD` | app background |
| `--surface` | `#FFFFFF` | cards, tables, dialogs |
| `--surface-2` | `#F3F6F7` | sidebar, wells, table head |
| `--ink-900` | `#0E141A` | primary text |
| `--ink-600` | `#45525E` | secondary text |
| `--ink-400` | `#8192A0` | meta text, icons |
| `--line` | `#E2E8EC` | hairlines |
| `--line-strong` | `#C6D1D9` | table borders |
| `--accent-700` | `#0A4A38` | primary action (hover) |
| `--accent-600` | `#0C5A45` | primary action, focus ring |
| `--accent-100` | `#DDEEE7` | selected wash |
| `--ok-600` `#2E7D46` · `--warn-700` `#7A5200` on `--warn-100` `#F6EBD0` · `--danger-600` `#A03030` on `--danger-050` `#FAEDED` · `--info-600` `#3A5B8C` | status only, always paired with label/icon — never color-alone |

## Space / shape / elevation

4px grid: `4, 8, 12, 16, 24, 32, 48`. Radius: `--r1: 2px` controls, `--r2: 4px` containers — nothing larger. No soft-shadow aesthetic: hairline borders carry separation; only overlays (dialog/menu/toast) get `0 1px 2px rgb(14 20 26 / .07), 0 10px 28px rgb(14 20 26 / .13)`.

## Motion

State-conveying only: 150–220ms ease-out on opacity/transform. Loading = skeletons, never spinners alone. `prefers-reduced-motion` cuts all non-essential motion. No entrance choreography in the console; the landing page gets exactly one restrained scroll reveal set.

## Component grammar (selected rules)

- **Tables** are the console's core instrument: 13px, 40px rows, sticky dense header on `--surface-2`, row hover wash, `tnum` numerals, mono codes for IDs, status pills (icon + word, tinted), actions right-aligned quiet buttons. Sort/filter/pagination are URL state. Never card-ify on mobile — priority columns + in-place expansion.
- **Sidebar**: `--surface-2`, 244px, icon+label items, active = accent left bar + wash. Collapses to icon rail ≤1200px; top bar + drawer ≤768px.
- **Buttons**: primary filled `--accent-600`; secondary outline; danger quiet red; ghost for row actions. All with hover/focus/active/disabled/loading.
- **Dialogs**: confirmation pattern for destructive actions names the target + consequence; action verb on button; focus trapped, return focus on close.
- **Forms**: labels above, 13px help text, errors under field in `--danger-600` with icon, server errors map to fields; dirty navigation guard.
- **Empty states**: one-line fact + one suggested action + (occasionally) a CTA. Never cutesy.
- **Landing**: Source Serif display, wide margins, hairline rules, registry-extract motif (illustrative ledger fragment in mono) as the hero visual. Available-now vs roadmap is a typographic distinction, not a badge storm.

## Accessibility floor (WCAG 2.2 AA)

Contrast tokens ≥ 4.5:1 for text; visible 2px focus ring on everything interactive; semantic elements before ARIA; dialogs/menus manage focus; toasts are `aria-live`; tables keep real `<th scope>`; status = icon + text; reduced-motion respected.
