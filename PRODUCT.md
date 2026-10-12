# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

React 18 + TypeScript + Vite, FastAPI + Python 3.12 + SQLAlchemy 2.0 + asyncpg, PostgreSQL 16, TanStack Query, React Hook Form + Zod, CSS Custom Properties for design tokens

## Users

**Primary: Super Admin (Platform Administrator)**
- Role: Platform-level administrator managing multiple institutions
- Situation: Logs into the platform console to oversee all institutions, users, administrators, roles, permissions, and audit activity
- Job: Institution lifecycle management, user administration, role/permission governance, platform configuration, audit review, compliance oversight

**Secondary: Student, Teacher, Parent (role portals, in scope since 2026-10-08)**
- Sign in to a role-specific portal (`/s`, `/t`, `/p`) with a read-only dashboard; data is demonstration data from gateway BFFs until academic services exist (see OD-7)

**Future: Institution Manager**
- Not in current scope but informs the data model

## Product Purpose

EduBot is an education operating system that unifies institutional management, learning, and administration on a single multi-tenant platform. The current MVP delivers the Super Admin console: a platform-wide administrative console for managing institutions, users, administrators, roles/permissions, and audit trails — with deterministic synthetic data demonstrating real-world scale and tenant isolation.

What success means: A Super Admin can log in, see platform-wide metrics, manage institutions and users, configure roles/permissions, and review audit trails — all through an interface that feels like a serious, premium institutional operating system, not a generic dashboard.

## Positioning

EduBot is the **institutional operating system** — not a generic LMS or CRM. Its differentiator is treating tenancy as a primitive (not a filter), audit as a first-class product feature (not ops logging), and RBAC as a policy engine (not role-name checks). The platform enforces tenant isolation at the architectural level, not as an afterthought. Super Admin operates at platform scope; all other roles are institution-scoped by construction.

## Operating Context

- **Multi-tenant by default**: Every institution is isolated; cross-tenant access is structurally impossible for non-platform roles
- **Audit as product**: Every mutation and denied privileged attempt emits an immutable audit event; no delete UI exists
- **RBAC as data**: Permissions are capabilities; roles compose capabilities; assignments carry explicit scope (platform/institution)
- **Synthetic data reality**: 18 institutions, 3,308 people (2,139 students, 143 teachers, 1,003 parents, 23 administrators), ~160 audit events across 90 days, with deliberate isolation fixtures (same person name in multiple institutions, same email local-part across domains)
- **Platform console + role portals**: Super Admins operate at platform scope; students, teachers and parents get read-only role portals scoped to themselves

## Capabilities and Constraints

**Confirmed (MVP):**
- Super Admin authentication (email/password, JWT + rotating refresh tokens, CSRF guard)
- Institution CRUD + status management (active/pending/suspended)
- Platform-wide user registry with search, filter, pagination (3,000+ records)
- Administrator management with role assignment and simulated invitation
- Role/permission management (catalog, roles, assignments, member counts)
- Audit trail with filtering (actor, action, target, institution, result, date)
- Platform settings (name, support email, sign-in notice)
- Profile (identity, roles, own activity)
- Deterministic seed data for consistent demos

**Now in scope (2026-10-08, see docs/plans/student-experience-plan.md):** student LMS experience (Today, Learn, Practice, Progress, Inbox), a hint-first AI tutor grounded in institution material, class rosters, sign-in session logging for every role, and a teacher-reviewed learning trail. Colleges are the primary market; schools are supported per institution with minor safeguards.

**Explicitly Out of Scope (Future):**
- Real notifications infrastructure
- Real email delivery
- MFA/SSO/OIDC (architecturally ready, not implemented)
- Institution Manager portal

**Constraints:**
- Tenant isolation is architectural: every institution-owned row has institution_id; cross-tenant access is prevented at the repository layer
- Authorization is policy-based: `require_perm(ctx, "domain.action")` — never role-name string comparisons
- Audit is append-only product data: no delete UI, no edit, retention policy TBD
- Super Admin = platform scope; institution-scoped contexts never receive platform-wide results
- No hardcoded secrets; dev defaults in `.env.example` only

## Brand Commitments

- **Name**: EduBot
- **Tagline**: "One platform for institutional management and learning"
- **Voice**: Concise, clear, direct, professional, human. Sentence case. Actions name their result ("Create institution", "Save changes", "Deactivate user"). Errors state what happened and what to do next — never apologize, never vague.
- **Visual identity**: Institutional/academic authority, precision, modernity, trust. Not generic SaaS. Not "AI blue/purple." Not glassmorphism. Not gradient washes. Not rounded-card grids.
- **Visual direction (2026-10-08)**: the category standard for a modern B2B education platform, played straight and executed at Stripe's craft level (finish, motion, detail), never copying Stripe's look. The live EduBot product is the hero; proof is seeded demo data, always labelled as demo.
- **Banned outright**: purple-to-blue gradients, gradient hero text, emojis in headings, Inter everywhere, coloured left-border cards, glassmorphism cards, low-contrast dark mode, three icon boxes in a row, a badge above the headline, Lucide icons everywhere, untouched shadcn components, sections fading in on scroll, cursor-following beams, hover effects that fade buttons, inconsistent spacing, em dashes, buzzword copy, serif italics for accent words, Space Grotesk + Instrument Serif, grain texture over gradients.
- **Visual principles**: Institutional authority, precision, modernity, trust, scale, clarity, academic credibility, operational sophistication. Dense but scannable. Meaningful color, not decoration. Typography as hierarchy. Motion as state feedback.

## Evidence on Hand

- **Real API contracts**: 6 services, 45+ endpoints, OpenAPI-compatible problem-details errors
- **Real data**: 18 institutions, 3,308 synthetic users, 160+ audit events, deterministic seed
- **Real tests**: 45 backend tests (unit + API + security E2E), 6 frontend tests
- **Real infrastructure**: 6 services, 5 PostgreSQL databases, API Gateway, Docker Compose
- **No fake content**: No fake customers, fake metrics, fake testimonials, fake logos, fake statistics

## Product Principles

1. **Tenancy is a primitive, not a filter** — Every institution-owned row has institution_id; isolation is enforced at the repository layer, not in UI
2. **Audit is product, not ops** — Immutable events, queryable, no delete UI, denied attempts are events
3. **Authorization is a policy call** — `require_perm(ctx, "domain.action")` — never role-name comparisons
4. **Super Admin = platform scope** — Institution-scoped contexts never receive platform-wide results
5. **Density is a feature** — Data-dense tables, compact panels, scannable metrics; whitespace serves hierarchy, not decoration
6. **Color communicates, never decorates** — Semantic state vocabulary (success/warning/danger/info), accent for primary actions only
7. **Motion conveys state, not decoration** — 150-250ms transitions, state changes only, reduced-motion respected
8. **The tool disappears into the task** — Earned familiarity over surprise; consistent component vocabulary

## Accessibility & Inclusion

- Target: WCAG 2.2 AA
- Keyboard-complete flows, visible focus states, semantic HTML
- Status never by color alone (icon + text + color)
- Reduced-motion respected
- Screen-reader labels on icon buttons
- Accessible table semantics, dialog focus management
- Error messages programmatically associated with fields

---

## Stack

React 18 + TypeScript + Vite, FastAPI + Python 3.12 + SQLAlchemy 2.0 + asyncpg, PostgreSQL 16, TanStack Query, React Hook Form + Zod, CSS Custom Properties for design tokens