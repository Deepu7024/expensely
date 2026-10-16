import json
import os
from datetime import datetime, timezone
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, Response, status
from pydantic import BaseModel, EmailStr, Field
from sqlmodel import Session, select

from app.auth import (
    CurrentUser,
    DUMMY_HASH,
    clear_session_cookie,
    password_hash,
    set_session_cookie,
)
from app.database import claim_legacy_data, get_session, seed_user_defaults
from app.models import AuthSession, GmailCredential, User

router = APIRouter(prefix="/auth", tags=["auth"])


class CredentialsInput(BaseModel):
    email: EmailStr
    password: str = Field(min_length=10, max_length=128)


class UserOut(BaseModel):
    id: str
    email: str
    gmailConnected: bool = False


def _out(session: Session, user: User) -> UserOut:
    gmail = session.exec(select(GmailCredential.id).where(GmailCredential.userId == user.id)).first()
    return UserOut(id=user.id, email=user.email, gmailConnected=gmail is not None)


@router.post("/register", response_model=UserOut, status_code=201)
def register(payload: CredentialsInput, response: Response, session: Session = Depends(get_session)):
    email = payload.email.strip().lower()
    if session.exec(select(User).where(User.email == email)).first() is not None:
        raise HTTPException(status_code=409, detail="An account with that email already exists")
    is_first_user = session.exec(select(User.id)).first() is None
    if not is_first_user and os.getenv("ALLOW_REGISTRATION", "true").lower() != "true":
        raise HTTPException(status_code=403, detail="Registration is currently invite-only")

    now = datetime.now(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")
    user = User(email=email, passwordHash=password_hash.hash(payload.password), createdAt=now)
    session.add(user)
    session.commit()
    session.refresh(user)

    if is_first_user:
        claim_legacy_data(session, user.id)
        legacy_token_path = Path(os.getenv("GMAIL_TOKEN_FILE", "token.json"))
        if legacy_token_path.exists():
            try:
                token_json = legacy_token_path.read_text()
                json.loads(token_json)
                session.add(GmailCredential(userId=user.id, credentialsJson=token_json, updatedAt=now))
                session.commit()
            except (OSError, ValueError):
                session.rollback()

    seed_user_defaults(session, user.id)
    set_session_cookie(response, session, user)
    return _out(session, user)


@router.post("/login", response_model=UserOut)
def login(payload: CredentialsInput, response: Response, session: Session = Depends(get_session)):
    email = payload.email.strip().lower()
    user = session.exec(select(User).where(User.email == email)).first()
    stored_hash = user.passwordHash if user is not None else DUMMY_HASH
    valid = password_hash.verify(payload.password, stored_hash)
    if user is None or not valid:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Incorrect email or password")
    set_session_cookie(response, session, user)
    return _out(session, user)


@router.get("/me", response_model=UserOut)
def me(user: CurrentUser, session: Session = Depends(get_session)):
    return _out(session, user)


@router.post("/logout", status_code=204)
def logout(
    response: Response,
    user: CurrentUser,
    session: Session = Depends(get_session),
):
    # Remove all sessions for this browser's user. This intentionally signs
    # out old tabs too and avoids leaving forgotten bearer material behind.
    for row in session.exec(select(AuthSession).where(AuthSession.userId == user.id)).all():
        session.delete(row)
    session.commit()
    clear_session_cookie(response)
