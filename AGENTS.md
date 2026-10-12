# AGENTS.md — working agreements for EduBot

## Architecture guardrails (highest priority)

1. **Tenancy is a primitive, not a filter.** Every institution-owned row has `institution_id`. All data access goes through the shared `RequestContext` + repository helpers in `services/shared/tenancy.py`. Never write `if row.institution_id == ...` checks in route handlers.
2. **Service-owned data is non-negotiable.** A service never connects to another service's database. Cross-service reads happen through internal HTTP APIs (`X-Edubot-Internal-Token` + `X-Edubot-*` context headers).
3. **Authorization is a policy call.** Use `require_perm(ctx, "<domain>.<verb>")`. Never compare role names in code.
4. **Audit is append-only product data.** Mutations and denied privileged attempts emit events via the shared audit client. No edit/delete of audit events anywhere. Product audit log ≠ operational logs.
5. **Super Admin = platform scope.** Institution-scoped contexts must never receive platform-wide results, and tests must keep proving it (`services/*/tests`, `services/gateway/tests/test_security_e2e.py`).

## Scope discipline

- Surfaces in scope: landing, sign-in, the admin console (dashboard, institutions, users, administrators, roles & permissions, activity, settings, profile) the student/teacher/parent role portals (see OD-7), sign-in sessions and class rosters, the student LMS + AI tutor experience planned in `docs/plans/student-experience-plan.md`, Doubts + Topics, and the study core + India edge (Practice, Progress, Schedule, credits, photo doubts, tutor language, offline lessons) per `docs/research/student-product-map.md` and `docs/plans/study-core-india-edge.md`. Build only what that plan has approved; do not build manager portals or notification infrastructure.
- Do not invent product requirements; flag ambiguity in `docs/architecture/README.md` Open Decisions instead.

## Design guardrails (see DESIGN.md)

- Modern institutional SaaS at Stripe's finish level: cool neutrals + one EduBot orange accent (contrast-calibrated, `--on-brand` for text on fills), Geist + Geist Mono, Phosphor icons, hairline rules, tabular numerals. Motion is state-driven or scroll-scrubbed, never scroll-reveal fades. The full banned list lives in PRODUCT.md.
- Every interactive component ships the full state vocabulary: default/hover/focus/active/selected/disabled/loading/success/warning/error/empty. Skeletons, not spinners. Empty states teach.
- WCAG 2.2 AA: visible focus, keyboard-complete flows, status never by color alone, reduced-motion respected.

## Engineering conventions

- Python 3.12 / FastAPI / SQLAlchemy 2 async; services under `services/<name>/` with `main.py`, `models.py`, `repo.py`, `api.py`, `tests/`.
- Frontend: React 18 + TS + Vite in `apps/web`; TanStack Query for server state; react-hook-form + zod for forms; URL-persisted list state via `useSearchParams`; no hardcoded data in components.
- Errors use the shared problem-details shape (`services/shared/errors.py`, code in `detail.code`).
- Tests are part of the definition of done: unit + API + tenant-isolation + denied-audit coverage per service.
- No secrets in source. Dev defaults live in `.env.example` only.

## Commands

`make setup · make db · make seed · make dev · make test · make test-web · make lint`
