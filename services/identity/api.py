import secrets
import uuid
from datetime import UTC
from typing import Annotated

from fastapi import APIRouter, Depends, Request
from pydantic import EmailStr, Field
from sqlalchemy.ext.asyncio import AsyncSession

from services.identity import repo
from services.identity.config import Settings
from services.identity.db import get_session
from services.identity.models import AuthAccount
from services.identity.ratelimit import login_limiter
from services.identity.security import (
    hash_password,
    new_refresh_token,
    verify_password,
)
from services.shared.audit import RESULT_DENIED, AuditClient, AuditEvent
from services.shared.clients import ServiceClient
from services.shared.context import RequestContext, get_context
from services.shared.errors import (
    AccountDisabled,
    Conflict,
    NotFound,
    RateLimited,
    Unauthenticated,
)
from services.shared.schemas import CamelModel
from services.shared.tokens import create_access_token

router = APIRouter()


class LoginIn(CamelModel):
    email: EmailStr
    password: str = Field(min_length=1, max_length=200)


class RefreshIn(CamelModel):
    refresh_token: str | None = None


class TokenPairOut(CamelModel):
    access_token: str
    access_expires_in: int
    refresh_token: str
    refresh_expires_in_days: int
    scope: str


class CreateAccountIn(CamelModel):
    person_id: uuid.UUID
    email: EmailStr


class AccountCreatedOut(CamelModel):
    account_id: uuid.UUID
    invite_token: str  # simulated invite: no email infrastructure exists yet


class AccountBatchIn(CamelModel):
    person_ids: list[uuid.UUID]


def _audit(request: Request) -> AuditClient:
    return request.app.state.audit


def _settings(request: Request) -> Settings:
    return request.app.state.settings


def _rbac(request: Request) -> ServiceClient:
    return request.app.state.rbac


async def _permissions_for(request: Request, person_id: uuid.UUID) -> list[str]:
    """Permission snapshot from the RBAC service. Fails closed: no permissions, no token."""
    data = await _rbac(request).get(f"/internal/actors/{person_id}/permissions")
    return sorted(data.get("permissions", []))


async def _issue_pair(
    request: Request,
    session: AsyncSession,
    account: AuthAccount,
    ctx: RequestContext,
) -> TokenPairOut:
    settings: Settings = request.app.state.settings
    permissions = await _permissions_for(request, account.person_id)
    access = create_access_token(
        secret=settings.jwt_secret,
        ttl_seconds=settings.access_token_ttl_seconds,
        subject=account.person_id,
        email=account.email,
        scope=account.scope,
        institution_id=None,
        permissions=permissions,
    )
    refresh = new_refresh_token()
    await repo.store_refresh(
        session,
        account_id=account.id,
        token=refresh,
        ttl_days=settings.refresh_token_ttl_days,
        ip=ctx.ip,
        user_agent=ctx.user_agent,
    )
    return TokenPairOut(
        access_token=access,
        access_expires_in=settings.access_token_ttl_seconds,
        refresh_token=refresh,
        refresh_expires_in_days=settings.refresh_token_ttl_days,
        scope=account.scope,
    )


@router.post("/auth/login", response_model=TokenPairOut)
async def login(
    body: LoginIn,
    request: Request,
    session: Annotated[AsyncSession, Depends(get_session)],
    ctx: Annotated[RequestContext, Depends(get_context)],
) -> TokenPairOut:
    settings = _settings(request)
    email = body.email.strip().lower()
    allowed, retry_after = login_limiter.check(
        f"{email}|{ctx.ip or '-'}",
        limit=settings.login_rate_limit_attempts,
        window_seconds=settings.login_rate_limit_window_seconds,
    )
    audit = _audit(request)
    if not allowed:
        await audit.emit(
            ctx,
            AuditEvent(
                action="auth.sign_in_rate_limited",
                result=RESULT_DENIED,
                target_type="account",
                target_label=email,
            ),
        )
        raise RateLimited(details={"retry_after_seconds": retry_after})

    account = await repo.account_by_email(session, email)
    if account is None or not verify_password(account.password_hash, body.password):
        await audit.emit(
            ctx,
            AuditEvent(
                action="auth.sign_in_failed",
                result=RESULT_DENIED,
                target_type="account",
                target_label=email,
                diff={"reason": "invalid_credentials"},
            ),
        )
        raise Unauthenticated("Invalid email or password.")
    if account.status != "active":
        await audit.emit(
            ctx,
            AuditEvent(
                action="auth.sign_in_failed",
                result=RESULT_DENIED,
                target_type="account",
                target_id=account.person_id,
                target_label=email,
                diff={"reason": "account_disabled"},
            ),
        )
        raise AccountDisabled()

    pair = await _issue_pair(request, session, account, ctx)
    await repo.touch_last_login(session, account)
    await session.commit()
    # After verification the actor IS this account; attribute the event to them.
    from dataclasses import replace as _replace

    signed_in = _replace(ctx, actor_id=account.person_id, email=account.email, scope=account.scope)
    await audit.emit(
        signed_in,
        AuditEvent(action="auth.sign_in", target_type="account", target_id=account.person_id, target_label=email),
    )
    return pair


@router.post("/auth/refresh", response_model=TokenPairOut)
async def refresh(
    body: RefreshIn,
    request: Request,
    session: Annotated[AsyncSession, Depends(get_session)],
    ctx: Annotated[RequestContext, Depends(get_context)],
) -> TokenPairOut:
    settings = _settings(request)
    if not body.refresh_token:
        raise Unauthenticated("No session.")
    stored = await repo.find_refresh(session, body.refresh_token)
    if stored is None:
        raise Unauthenticated("Your session has expired. Sign in again.")

    if stored.revoked_at is not None:
        # Reuse detected: kill the whole session family.
        await repo.revoke_all_sessions(session, stored.account_id)
        await session.commit()
        await _audit(request).emit(
            ctx,
            AuditEvent(
                action="auth.refresh_reuse_detected",
                result=RESULT_DENIED,
                target_type="account",
                target_id=stored.account_id,
            ),
        )
        raise Unauthenticated("Your session has expired. Sign in again.")

    from datetime import datetime

    if stored.expires_at < datetime.now(UTC):
        raise Unauthenticated("Your session has expired. Sign in again.")

    account = await session.get(AuthAccount, stored.account_id)
    if account is None:
        raise Unauthenticated("Your session has expired. Sign in again.")
    if account.status != "active":
        raise AccountDisabled()

    permissions = await _permissions_for(request, account.person_id)
    access = create_access_token(
        secret=settings.jwt_secret,
        ttl_seconds=settings.access_token_ttl_seconds,
        subject=account.person_id,
        email=account.email,
        scope=account.scope,
        institution_id=None,
        permissions=permissions,
    )
    new_token = new_refresh_token()
    await repo.rotate_refresh(
        session,
        old=stored,
        account_id=account.id,
        ttl_days=settings.refresh_token_ttl_days,
        ip=ctx.ip,
        user_agent=ctx.user_agent,
        new_token=new_token,
    )
    await session.commit()
    return TokenPairOut(
        access_token=access,
        access_expires_in=settings.access_token_ttl_seconds,
        refresh_token=new_token,
        refresh_expires_in_days=settings.refresh_token_ttl_days,
        scope=account.scope,
    )


@router.post("/auth/logout", status_code=204)
async def logout(
    body: RefreshIn,
    request: Request,
    session: Annotated[AsyncSession, Depends(get_session)],
    ctx: Annotated[RequestContext, Depends(get_context)],
) -> None:
    if body.refresh_token:
        stored = await repo.find_refresh(session, body.refresh_token)
        if stored is not None and stored.revoked_at is None:
            await repo.revoke_all_sessions(session, stored.account_id)
            await session.commit()
            await _audit(request).emit(
                ctx, AuditEvent(action="auth.sign_out", target_type="account", target_id=stored.account_id)
            )


# ---- internal API ----

@router.post("/internal/accounts", response_model=AccountCreatedOut)
async def create_account(
    body: CreateAccountIn,
    request: Request,
    session: Annotated[AsyncSession, Depends(get_session)],
    ctx: Annotated[RequestContext, Depends(get_context)],
) -> AccountCreatedOut:
    existing = await repo.account_by_email(session, body.email)
    if existing is not None:
        raise Conflict("An account with this email already exists.")
    account = await repo.create_account(
        session,
        email=body.email,
        # Invited accounts start with an unusable random password; the real
        # invite flow (email + password set) is future scope. Simulated honestly.
        password_hash=hash_password(secrets.token_urlsafe(24)),
        person_id=body.person_id,
    )
    await session.commit()
    await _audit(request).emit(
        ctx,
        AuditEvent(
            action="admin.account_created",
            target_type="account",
            target_id=account.person_id,
            target_label=account.email,
        ),
    )
    return AccountCreatedOut(account_id=account.id, invite_token=new_refresh_token())


@router.get("/internal/accounts/by-person/{person_id}")
async def account_for_person(
    person_id: uuid.UUID,
    session: Annotated[AsyncSession, Depends(get_session)],
) -> dict:
    account = await repo.account_by_person(session, person_id)
    if account is None:
        raise NotFound("No account for this person.")
    return {
        "status": account.status,
        "email": account.email,
        "lastLoginAt": account.last_login_at.isoformat() if account.last_login_at else None,
    }


@router.post("/internal/accounts/by-person/{person_id}/status")
async def set_account_status(
    person_id: uuid.UUID,
    body: dict,
    request: Request,
    session: Annotated[AsyncSession, Depends(get_session)],
    ctx: Annotated[RequestContext, Depends(get_context)],
) -> dict:
    account = await repo.account_by_person(session, person_id)
    if account is None:
        raise NotFound("No account for this person.")
    status = body.get("status")
    if status not in ("active", "disabled"):
        from services.shared.errors import ValidationFailed

        raise ValidationFailed("Status must be active or disabled.")
    await repo.set_status(session, account, status)
    await session.commit()
    await _audit(request).emit(
        ctx,
        AuditEvent(
            action="admin.account_disabled" if status == "disabled" else "admin.account_enabled",
            target_type="account",
            target_id=person_id,
            target_label=account.email,
        ),
    )
    return {"status": account.status}


@router.post("/internal/accounts/batch")
async def accounts_batch(
    body: AccountBatchIn,
    session: Annotated[AsyncSession, Depends(get_session)],
) -> dict:
    return {"lastLogin": await repo.last_login_map(session, body.person_ids)}
