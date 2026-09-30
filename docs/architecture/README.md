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
