# EduBot

**One platform for institutional management and learning.**

EduBot is a multi-tenant Education Operating System. This repository currently contains the MVP: the public landing page and the platform-scoped **Super Admin console** (dashboard, institutions, users, administrators, roles & permissions, activity/audit, settings, profile), running on a deterministic synthetic dataset.

## Architecture at a glance

Distributed service boundaries with a single API edge. Every domain service owns its data and its own PostgreSQL database; services never reach into each other's tables.

```
apps/web (React + TS + Vite)
        │  cookies, /api/v1
services/gateway  — authn (JWT), request context, CSRF guard, routing, BFF aggregation
        │  X-Edubot-* context headers + internal token
        ├─ services/identity  → identity_db   (accounts, sessions, sign-in)
        ├─ services/tenancy   → tenancy_db    (institutions, platform settings)
        ├─ services/users     → users_db      (people registry: students/teachers/parents/admins)
        ├─ services/rbac      → rbac_db       (permissions, roles, assignments)
        └─ services/audit     → audit_db      (append-only product audit trail)
```

Full documentation: [`docs/architecture/README.md`](docs/architecture/README.md), decisions in [`docs/architecture/ADRs.md`](docs/architecture/ADRs.md), design language in [`DESIGN.md`](DESIGN.md).

## Quickstart

Prereqs: Python 3.12, Node 20, Docker.

```bash
make setup        # python venv + deps + web deps
make db           # start postgres (docker) and create databases
make seed         # deterministic synthetic dataset
make dev          # all services (8000-8005) + web (5173)
```

Open http://localhost:5173 → "Admin login".

Dev sign-in (synthetic, seeded): `sysadmin@edubot.example.edu` / `ChangeMe-admin-234!`

## Tests

```bash
make test         # backend unit + API + end-to-end-through-gateway suites
make test-web     # frontend critical tests
```

The security suite proves: cross-tenant reads/writes fail, institution-scoped actors never see platform data, deactivated admins cannot authenticate, self-deactivation is blocked, and denied actions are audited.

## Conventions

- Every tenant-owned row carries `institution_id`. Tenant scoping is enforced by the shared request-context/repository layer, never by ad-hoc filters in handlers.
- Authorization is a policy check (`require_perm(ctx, "institution.create")`), never a role-name string compare.
- Audit events are product data: append-only, no delete UI, separate from operational logs.
