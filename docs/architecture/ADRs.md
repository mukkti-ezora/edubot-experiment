# Architecture Decision Records

One file, ten decisions — the ones that materially affect implementation. Format: Context / Decision / Consequences.

---

## ADR-0001 Distributed services in a monorepo, deployable together

**Status:** accepted.
**Context:** Distributed architecture is a binding product requirement; "modular monolith" collapse is explicitly forbidden. Equally forbidden: microservice sprawl without ownership meaning.
**Decision:** Six deployables — `gateway`, `identity`, `tenancy`, `users`, `rbac`, `audit` — each an independent FastAPI app with its own database, developed in one monorepo and run side-by-side locally. They may be *deployed* on one host initially, but all communication is over explicit HTTP APIs with internal-token + context headers, exactly as if separated.
**Consequences:** true ownership boundaries from day one with sane local DX; extraction to independent infra later is ops work, not refactoring. Cost: inter-service reads require composition (gateway BFF) instead of JOINs.

## ADR-0002 Backend stack: Python 3.12 + FastAPI + SQLAlchemy 2 async

**Status:** accepted.
**Context:** need strong typing, validation, high dev velocity, async fan-out in the gateway, and a future AI-friendly ecosystem. Evaluated: Spring Boot (excellent type rigor, materially heavier iteration loop for this team), Django (couples to its own auth/ORM — fights service boundaries).
**Decision:** FastAPI + SQLAlchemy 2.0 (async, asyncpg) + Pydantic v2 + PyJWT + argon2-cffi + httpx.
**Consequences:** typed request/response contracts, one async model end-to-end, pytest-native testing. We forgo ORM-level business logic in favor of explicit repo functions.

## ADR-0003 Frontend stack: React + Vite + custom token CSS

**Status:** accepted.
**Context:** production-quality SPA, must not look like a UI-kit dashboard. Evaluated: Next.js (SSR adds nothing for an authenticated console; the landing page does not justify a server framework), Tailwind/UI kits (fast but their defaults read as generic SaaS — the opposite of the design requirement).
**Decision:** React 18 + TypeScript + Vite + React Router + TanStack Query (server state) + react-hook-form + zod (forms) + a hand-built design-token CSS system (DESIGN.md) with self-hosted `@fontsource-variable` fonts. Charts are inline SVG.
**Consequences:** full control of the ledger aesthetic; the trade is paying for our own table/dialog components — accepted, they're the product's identity.

## ADR-0004 PostgreSQL 16, database-per-service, no cross-service FKs

**Status:** accepted.
**Context:** tenancy and audit data are high-integrity; reporting is modest. Service-owned data is non-negotiable.
**Decision:** One Postgres 16 cluster locally; each service gets its own database (`identity_db`, `tenancy_db`, `users_db`, `rbac_db`, `audit_db`). Cross-service references are plain UUID columns plus internal-API validation. Schema bootstrap via SQLAlchemy `create_all` for now; Alembic is tracked as OD-1 before production.
**Consequences:** isolation failures become connection errors, not subtle leaks; joins across services are impossible by construction — composition moves to APIs/BFF.

## ADR-0005 AuthN: argon2id passwords, JWT access + rotating refresh, httpOnly cookies

**Status:** accepted.
**Context:** Super Admin sign-in only for MVP; must be ready for MFA/SSO without redesign; browser app needs CSRF safety.
**Decision:** Access = HS256 JWT, 15 min, claims `{sub,email,scope,perms[]}`. Refresh = opaque random token, DB-stored (argon2 hash), 30 days, rotation on use, httpOnly SameSite=Strict cookies for both; mutations require `X-Requested-With: fetch` header (CSRF guard). Login is rate-limited in-memory (10 attempts / 15 min / email+IP). Deactivation blocks login and refresh. MFA seam: a `pending_verification` stage can precede token minting without API change.
**Consequences:** stateless local verification at the edge; revocation lag ≤15 min for access tokens (accepted, documented); production moves to RS256 (OD-2).

## ADR-0006 Tenant context as a request primitive

**Status:** accepted.
**Context:** "don't rely on frontend filtering," "make forgetting the filter structurally hard," minimal scattered `institution_id ==` checks.
**Decision:** `services/shared/context.py` defines `RequestContext`; the gateway builds it from verified JWT claims and injects `X-Edubot-*` headers; services rebuild it in middleware guarded by the internal token. Repository helpers take the context and apply scope; `platform` scope is the explicit opt-out that only platform tokens carry.
**Consequences:** handler code reads declaratively; isolation is testable at every layer; new services inherit the primitive by reusing the shared kernel.

## ADR-0007 RBAC as data + shared policy kernel

**Status:** accepted.
**Context:** roles/permissions must be manageable in-product; final catalog evolves; no role-name string checks allowed.
**Decision:** `rbac_db` holds `permissions`, `roles`, `role_permissions`, `role_assignments(actor_id, scope, institution_id?)`. Token issuance snapshots permission keys into the JWT. Services enforce via `require_perm(ctx, "domain.verb")`, which also emits a denied-attempt audit event on failure.
**Consequences:** RBAC is editable data with an audit trail; enforcement is uniform; snapshot staleness is bounded by ADR-0005's TTL.

## ADR-0008 Audit is a separate append-only service

**Status:** accepted.
**Context:** auditability is a product feature; product audit must never be confused with ops logs; no delete UI.
**Decision:** `audit` service owns an append-only `audit_events` table and the Activity API. All services emit via the shared audit client over the internal API (1.5 s timeout); on failure the event is written to the structured ops log (`audit_fallback`) and processing continues. Event schema: id, occurred_at, actor(id/type/label), action, target(type/id/label), institution(id/label), result(success|denied|error), request_id, ip, user_agent, diff.
**Consequences:** every mutation and denial is recorded through one contract; the ODD-3 outbox upgrade protects against the synchronous-emission edge before real data.

## ADR-0009 Deterministic synthetic dataset behind the backend

**Status:** accepted.
**Context:** no real data exists; UI must behave like production (2,000+ users); dashboard numbers must derive from data, not hardcode.
**Decision:** `make seed` runs `scripts/seed.py`, a deterministic generator (seed `edubot-mvp-v1`) that writes through each service's own repository layer, respecting data ownership: 18 institutions, ~2,800 people across four types, 7 platform administrators with distinct roles, ~160 audit events spanning 90 days, and deliberate isolation fixtures (same person name in two institutions; same email local-part under two domains; one suspended institution; one pending).
**Consequences:** frontend never contains fixture data; replacing synthetic with real data is a data-plane change only; tenancy tests reuse the fixtures.

## ADR-0010 Testing: service pytests + in-process E2E through the gateway

**Status:** accepted.
**Context:** distributed stack must be testable without Docker-in-test; security invariants need executable proof.
**Decision:** Per-service pytest suites (unit + API via httpx ASGITransport, parallel `*_test` databases). `services/gateway/tests/test_security_e2e.py` composes *all six* apps in-process and drives flows through the gateway app: login → cookie handling → authorized and cross-tenant calls → denied audit verification. Frontend: Vitest + Testing Library for the DataTable/URL-state, login states, and confirmation-dialog guard. Browser E2E (Playwright) is configured and runs when browsers are available in the environment.
**Consequences:** the exact production request path (gateway → services → DB) is exercised in tests; browser-level E2E is a fast-follow, not a blocker.
