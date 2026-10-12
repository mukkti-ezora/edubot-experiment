# EduBot Architecture

Scope: MVP = public landing + Super Admin console on synthetic data. Boundaries are designed for the full platform (future: LMS, AI, notifications) without building it.

Decision log: [ADRs.md](ADRs.md).

## 1. Architecture diagram

```
                          ┌──────────────────────────────┐
                          │ apps/web — React SPA (Vite)  │
                          │ landing + Super Admin console│
                          └───────────────┬──────────────┘
                                          │ /api/v1, httpOnly cookies (SameSite=Strict)
                          ┌───────────────▼──────────────┐
                          │ services/gateway             │
                          │ JWT verify · CSRF guard ·    │
                          │ request-context injection ·  │
                          │ routing · BFF aggregation    │
                          └──┬─────┬─────┬─────┬─────┬───┘
                X-Edubot-* context headers + X-Edubot-Internal-Token
          ┌──────────────────┐ ┌───┴─────┐ ┌───┴────┐ ┌───┴───┐ ┌──┴──────┐
          │ identity         │ │ tenancy │ │ users  │ │ rbac  │ │ audit   │
          │ sign-in, sessions│ │ instit. │ │ people │ │ roles │ │ events  │
          │ refresh rotation │ │ settings│ │ admins │ │ perms │ │ (append)│
          └────────┬─────────┘ └────┬────┘ └───┬────┘ └───┬───┘ └────┬────┘
              identity_db      tenancy_db  users_db    rbac_db    audit_db
                    └───────────  one PostgreSQL 16 cluster  ──────────┘

Service-to-service calls (explicit internal APIs only, never cross-database):
  identity → rbac     permission snapshot at token issue
  users    → rbac     role filter evaluation, role enrichment
  users    → tenancy  institution existence/label lookups
  gateway  → all four dashboard/institution composition (BFF)
  all      → audit    event emission (sync, fail-open to ops log)
```

## 2. Service map

| Service | Port | Owns | Public API (via gateway) | Internal API |
|---|---|---|---|---|
| gateway | 8080 | — (stateless edge) | everything under `/api/v1` | — |
| identity | 8001 | auth accounts, refresh sessions | `/auth/login|logout|refresh|me` | `/internal/accounts/{id}/status`, `/internal/accounts/batch` |
| tenancy | 8002 | institutions, platform settings | `/institutions*`, `/settings/*` | `/internal/institutions/batch`, `/internal/stats/institutions` |
| users | 8003 | people (students/teachers/parents/admins) | `/users*`, `/administrators*` | `/internal/stats/users`, `/internal/stats/institution-users` |
| rbac | 8004 | permissions, roles, assignments | `/permissions`, `/roles*`, assignments under roles/admins | `/internal/actors/{id}/permissions`, `/internal/assignments/lookup`, `/internal/actors/{id}/roles` |
| audit | 8005 | audit events (append-only) | `/activity*` | `POST /internal/events` |

## 3. Technology choices

| Layer | Choice | Why (ADR) |
|---|---|---|
| Frontend | React 18, TypeScript, Vite, React Router, TanStack Query, react-hook-form + zod, custom token CSS | 0003 |
| Backend | Python 3.12, FastAPI, SQLAlchemy 2 async, asyncpg, Pydantic v2, PyJWT, argon2-cffi, httpx | 0002 |
| Datastore | PostgreSQL 16, one database per service | 0004 |
| Edge | FastAPI gateway with BFF aggregation | 0001 |
| Packaging | single monorepo, one venv, docker-compose for Postgres only | 0001 |
| Testing | pytest + ASGI-transport E2E through gateway, Vitest + Testing Library | 0010 |

No Redis/Kafka/K8s/search engine: no current requirement justifies them. Rate limiting is in-memory in identity (single-instance MVP; ADR notes the upgrade path).

## 4. Data ownership

A row is mutated only by its owning service; nobody else connects to that database. Cross-service references are **IDs only** (no foreign keys across boundaries): e.g. `users.institution_id` references a tenancy row by value, validated through tenancy's internal API when needed; `rbac.role_assignments.actor_id` references an identity/users actor by value. Read-side composition (e.g. institution detail + its user counts, admin list + roles + last sign-in) happens in the gateway's BFF endpoints, which call the owning services and merge.

## 5. Tenant isolation strategy

- Every tenant-owned row carries `institution_id` (NOT NULL in tenant scope).
- Each request resolves a `RequestContext` exactly once: `{actor_id, email, scope: platform|institution, institution_id, permissions, request_id, ip, user_agent}`.
- Services construct the context from gateway-injected headers guarded by the internal token — handlers cannot bypass it.
- Repositories receive the context; institution-scoped queries are filtered by the repository helper (`services/shared/tenancy.py`), platform scope is the explicit opt-out path used only for Super Admin.
- Proven by tests: cross-tenant read/write attempts → 403/404; institution-scoped actor requesting platform lists → 403; every denial emits an audit event.

## 6. Auth/RBAC strategy

**AuthN (ADR-0005):** email+password, argon2id hashes. Login mints a short-lived JWT access token (15 min, claims: sub, email, scope, permission snapshot) plus a rotating refresh token. Both are httpOnly SameSite=Strict cookies; mutations additionally require `X-Requested-With` (CSRF guard). Deactivated accounts fail at login *and* at refresh. MFA seam: token issuance happens only after the full credential chain, so a verification stage can be inserted without reshaping the flow.

**AuthZ (ADR-0007):** `User → RoleAssignment → Role → Permissions`. Permissions are capability keys (`institution.create`, `audit.read`, …). Handlers declare requirements via `require_perm(ctx, key)` from the shared policy kernel — never role-name comparisons. Permission snapshots ride in the access token (15-min staleness bound; documented tradeoff).

## 7. API strategy

- Versioned prefix `/api/v1`. JSON, camelCase bodies.
- List endpoints share one contract: `?query=&sort=&cursor=&limit=` + filters; response `{items, nextCursor, total?}`. Frontend mirrors list state in URL search params.
- Mutations: POST create, PATCH update, POST action endpoints (`/suspend`, `/activate`) — auditing and confirmation belong to the action, not generic PUTs.
- Errors: problem-details shape `{code, message, details?, requestId}`; codes: `VALIDATION_ERROR, UNAUTHENTICATED, FORBIDDEN, TENANT_VIOLATION, NOT_FOUND, CONFLICT, RATE_LIMITED, ACCOUNT_DISABLED, INTERNAL`.
- Every request gets a `X-Request-Id`; it propagates through gateway → services → audit events.

## 8. Local development strategy

One command (`make dev`): Postgres in Docker; the gateway (8080) and five domain services (8001–8005) as local uvicorn processes; Vite dev server proxies `/api` to the gateway. `make seed` loads the deterministic synthetic dataset (ADR-0009). Tests run against parallel `*_test` databases; E2E composes all services in-process over ASGI transports, so the full distributed path is verified without Docker-in-test.

## 9. Important tradeoffs

1. **Permission snapshots in access tokens are stale up to 15 min.** Chosen over per-request introspection (chatty). Bound is short; refresh re-evaluates. Revisit if admin revocation must be instant.
2. **Audit emission is synchronous best-effort with an ops-log fallback**, not an outbox/queue. Documented upgrade path (ADR-0008); audit loss risk is logged loudly when fallback fires.
3. **create_all schema bootstrap instead of Alembic migrations.** Services are young; schemas will churn this week. Alembic is a pre-production gate (Open Decisions).
4. **Gateway in-process rate limiting only at identity.** Sufficient at one instance; horizontal scale requires shared store later.
5. **BFF aggregation lives in the gateway**, not a separate service — avoids a sixth deployable for two composite reads; if composition grows, extract `services/platform-read`.
6. **One Python venv shared by all services in dev.** Dependency isolation between services is a build/packaging concern deferred to containerization.

## 10. Open decisions

- **OD-1** Alembic migration setup before production cutover (owner: backend; blocks production).
- **OD-2** Token signing: HS256 shared-secret (dev) → RS256 asymmetric keys (production, key rotation story).
- **OD-3** Audit durability: promote fail-open emission to a transactional outbox table per service + relay (before real data).
- **OD-4** Instant permission revocation (short TTL vs introspection vs denylist) once institution-scoped users authenticate.
- **OD-5** Notification boundary shape (needed when real invites/emails replace the simulated invite flow).
- **OD-6** Physical deployment topology (compose vs containers per service vs orchestrator) — deferred to the first real environment.
- **OD-7** Role portals (student/teacher/parent) are in scope as of 2026-10-08. Open: (a) their dashboards serve demonstration data from gateway BFFs until academic services (timetable, grades, fees) exist; (b) access is gated on session scope at the gateway, which should move to `require_perm` once role permissions are minted by RBAC; (c) denied dashboard attempts are not yet audited at the gateway.
- **OD-8** Sign-in sessions (2026-10-08): identity owns `auth_sessions`; the session id travels as the `sid` token claim and `X-Edubot-Session-Id`, and is stamped on audit events. Retention decided: 60 days after a session ends or goes idle, rotated out by identity at startup and every 6 hours (`SESSION_RETENTION_DAYS`); audit events keep their session id. Open: whether institution admins get a tenant-scoped sessions view. Revoking a session stops refresh at once, but its current access token keeps working for up to 15 minutes (tradeoff 1 / OD-4); making revocation instant needs the gateway to check `sid` against identity.
- **OD-9** Class roster (2026-10-08): `class_sections` / `class_members` in the users service, tenant-owned. Open: admin UI for managing rosters, SIS import, and terms/archiving.
- **OD-10** Learning trail vs audit (2026-10-08): learner activity (lessons opened, formats, completions, tutor turns) is recorded in the learning service's `learning_events`, rotated after 60 days, rather than in the append-only admin audit log; only denied attempts reach audit. Open: confirm this split, and build the teacher review surface the tutor rules promise (flagged `tutor_flagged` events, unanswered `tutor_unavailable` events). The tutor no longer claims teachers are notified until that surface exists. Tutor spend is capped per student (`TUTOR_MESSAGES_PER_MINUTE` 8, `TUTOR_MESSAGES_PER_DAY` 200, in-process like tradeoff 4); a per-institution budget is open.
- **OD-11** Doubts + Topics (2026-10-11): doubts live in the learning service (next to lessons, tutor chats and the trail) and are routed by class section to that section's teachers. Defaults chosen pending product sign-off: text only (photo attachments wait for a file-storage decision); reply target 48 hours (`DOUBT_REPLY_HOURS`, global for now, per-institution later); overdue doubts are flagged in the teacher inbox, with no head-of-department escalation because that role does not exist yet; caps of 10 new doubts and 30 follow-ups per student per day and 50 messages per doubt, counted from the database; AI drafts are teacher-reviewed, never sent automatically, and capped at 5 per teacher per minute (in-process, like tradeoff 4). Teacher replies, drafts and views of a student's tutor chat are audited. Open: per-institution reply targets, publishing answered doubts to a class FAQ (feature #14), and a head-of-department escalation path.
- **OD-12** Study core + India edge (2026-10-12). Decisions taken while building phases 1 and 2 of the product map:
  - **Where it lives:** the learning service owns the academic core (practice, coursework, progress, schedule). Split it into its own service if it outgrows that.
  - **Files** are stored in Postgres (`attachments`): PNG, JPEG, WebP and PDF only, with magic-byte checks, a 10 MB limit streamed at the gateway and the service, and a daily count cap. Images open inline, PDFs download, and teachers opening a student's file is audited. Object storage and orphan clean-up are open.
  - **Calendar days** use `INSTITUTION_TIMEZONE` (default Asia/Kolkata). A per-institution zone is open.
  - **AI caps:** AI generation (practice, flashcards, doubt drafts) is reserved through an advisory-locked daily allowance, so parallel requests can't overspend. The tutor and draft per-minute limits, and check-in guessing limits, stay in-process (tradeoff 4).
  - **Grades:** the UGC 10-point scale, with default category weights of Assignments 40, Quizzes 20, Mid-term 40. Per-course weights are open.
  - **MOOC credit** is capped per term at 40% of current-term credits, counting pending claims. ABC/APAAR is recorded locally only; real ABC/DigiLocker sync is open.
  - **Attendance:** present, late and on-duty count as attended; excused classes leave the denominator; the minimum is 75%. Check-in uses a 6-digit keyed-hash code open for 10 minutes. A QR image and location checks are open.
  - **Answer keys** for graded tests stay hidden until the window closes and while retakes remain.
  - **Not built:** teacher authoring of questions and tests, group assignments, keeping previous submission versions, live classes, and a hall ticket or ERP connection.
