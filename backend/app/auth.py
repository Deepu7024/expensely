import hashlib
import os
import secrets
from datetime import datetime, timedelta, timezone
from typing import Annotated

from fastapi import Cookie, Depends, HTTPException, Response, status
from pwdlib import PasswordHash
from sqlmodel import Session, select

from app.database import get_session
from app.models import AuthSession, User

SESSION_COOKIE = "expensely_session"
SESSION_DAYS = int(os.getenv("SESSION_DAYS", "30"))
COOKIE_SECURE = os.getenv("COOKIE_SECURE", "false").lower() == "true"
password_hash = PasswordHash.recommended()
DUMMY_HASH = password_hash.hash("expensely-dummy-password")


def now_utc() -> datetime:
    return datetime.now(timezone.utc)


def iso(value: datetime) -> str:
    return value.isoformat(timespec="milliseconds").replace("+00:00", "Z")


def hash_token(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def set_session_cookie(response: Response, session: Session, user: User) -> None:
    raw_token = secrets.token_urlsafe(32)
    created = now_utc()
    session.add(
        AuthSession(
            userId=user.id,
            tokenHash=hash_token(raw_token),
            createdAt=iso(created),
            expiresAt=iso(created + timedelta(days=SESSION_DAYS)),
        )
    )
    session.commit()
    response.set_cookie(
        SESSION_COOKIE,
        raw_token,
        max_age=SESSION_DAYS * 24 * 60 * 60,
        httponly=True,
        secure=COOKIE_SECURE,
        samesite="lax",
        path="/",
    )


def clear_session_cookie(response: Response) -> None:
    response.delete_cookie(SESSION_COOKIE, path="/", httponly=True, samesite="lax", secure=COOKIE_SECURE)


def get_current_user(
    session_token: Annotated[str | None, Cookie(alias=SESSION_COOKIE)] = None,
    session: Session = Depends(get_session),
) -> User:
    if not session_token:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Sign in required")
    auth_session = session.exec(
        select(AuthSession).where(AuthSession.tokenHash == hash_token(session_token))
    ).first()
    if auth_session is None or datetime.fromisoformat(auth_session.expiresAt.replace("Z", "+00:00")) <= now_utc():
        if auth_session is not None:
            session.delete(auth_session)
            session.commit()
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Session expired")
    user = session.get(User, auth_session.userId)
    if user is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid session")
    return user


CurrentUser = Annotated[User, Depends(get_current_user)]
