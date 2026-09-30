import uuid
from datetime import UTC, datetime, timedelta

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from services.identity.models import AuthAccount, RefreshToken
from services.identity.security import refresh_digest


async def account_by_email(session: AsyncSession, email: str) -> AuthAccount | None:
    result = await session.execute(
        select(AuthAccount).where(AuthAccount.email == email.strip().lower())
    )
    return result.scalar_one_or_none()


async def account_by_person(session: AsyncSession, person_id: uuid.UUID) -> AuthAccount | None:
    result = await session.execute(
        select(AuthAccount).where(AuthAccount.person_id == person_id)
    )
    return result.scalar_one_or_none()


async def create_account(
    session: AsyncSession,
    *,
    email: str,
    password_hash: str,
    person_id: uuid.UUID,
) -> AuthAccount:
    account = AuthAccount(
        email=email.strip().lower(),
        password_hash=password_hash,
        person_id=person_id,
        scope="platform",
        status="active",
    )
    session.add(account)
    await session.flush()
    return account


async def set_status(session: AsyncSession, account: AuthAccount, status: str) -> None:
    account.status = status
    if status == "disabled":
        await revoke_all_sessions(session, account.id)


async def touch_last_login(session: AsyncSession, account: AuthAccount) -> None:
    account.last_login_at = datetime.now(UTC)


async def store_refresh(
    session: AsyncSession,
    *,
    account_id: uuid.UUID,
    token: str,
    ttl_days: int,
    ip: str | None,
    user_agent: str | None,
) -> RefreshToken:
    row = RefreshToken(
        account_id=account_id,
        token_hash=refresh_digest(token),
        expires_at=datetime.now(UTC) + timedelta(days=ttl_days),
        ip=ip,
        user_agent=user_agent,
    )
    session.add(row)
    await session.flush()
    return row


async def find_refresh(session: AsyncSession, token: str) -> RefreshToken | None:
    result = await session.execute(
        select(RefreshToken).where(RefreshToken.token_hash == refresh_digest(token))
    )
    return result.scalar_one_or_none()


async def rotate_refresh(
    session: AsyncSession, *, old: RefreshToken, account_id: uuid.UUID, ttl_days: int,
    ip: str | None, user_agent: str | None, new_token: str,
) -> RefreshToken:
    new = await store_refresh(
        session, account_id=account_id, token=new_token, ttl_days=ttl_days, ip=ip, user_agent=user_agent
    )
    old.revoked_at = datetime.now(UTC)
    old.replaced_by = new.id
    return new


async def revoke_all_sessions(session: AsyncSession, account_id: uuid.UUID) -> None:
    now = datetime.now(UTC)
    result = await session.execute(
        select(RefreshToken).where(
            RefreshToken.account_id == account_id, RefreshToken.revoked_at.is_(None)
        )
    )
    for row in result.scalars():
        row.revoked_at = now


async def last_login_map(session: AsyncSession, person_ids: list[uuid.UUID]) -> dict[str, str | None]:
    if not person_ids:
        return {}
    result = await session.execute(
        select(AuthAccount.person_id, AuthAccount.last_login_at).where(
            AuthAccount.person_id.in_(person_ids)
        )
    )
    return {
        str(person_id): ts.isoformat() if ts else None for person_id, ts in result.all()
    }
