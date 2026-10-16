import hashlib
import logging
import os
import secrets
from datetime import datetime, timedelta, timezone
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import RedirectResponse
from google_auth_oauthlib.flow import Flow
from googleapiclient.discovery import build
from sqlmodel import Session, select

from app.auth import CurrentUser
from app.database import get_session
from app.mail.gmail_client import SCOPES
from app.models import GmailCredential, GmailOAuthState

router = APIRouter(prefix="/gmail", tags=["gmail"])
logger = logging.getLogger(__name__)
WEB_CREDENTIALS_FILE = Path(os.getenv("GMAIL_WEB_CREDENTIALS_FILE", "credentials.web.json"))
FRONTEND_URL = os.getenv("FRONTEND_URL", "http://localhost:3000")


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _iso(value: datetime) -> str:
    return value.isoformat(timespec="milliseconds").replace("+00:00", "Z")


def _state_hash(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


@router.get("/status")
def gmail_status(user: CurrentUser, session: Session = Depends(get_session)):
    credential = session.exec(select(GmailCredential).where(GmailCredential.userId == user.id)).first()
    return {"connected": credential is not None, "email": credential.connectedEmail if credential else None}


@router.post("/connect")
def connect_gmail(request: Request, user: CurrentUser, session: Session = Depends(get_session)):
    if not WEB_CREDENTIALS_FILE.exists():
        raise HTTPException(
            status_code=503,
            detail="Gmail web OAuth is not configured. Add credentials.web.json and GMAIL_REDIRECT_URI.",
        )
    redirect_uri = os.getenv("GMAIL_REDIRECT_URI", str(request.url_for("gmail_callback")))
    flow = Flow.from_client_secrets_file(str(WEB_CREDENTIALS_FILE), scopes=SCOPES)
    flow.redirect_uri = redirect_uri
    raw_state = secrets.token_urlsafe(32)
    authorization_url, _ = flow.authorization_url(
        access_type="offline",
        include_granted_scopes="true",
        prompt="consent",
        state=raw_state,
    )
    session.add(
        GmailOAuthState(
            userId=user.id,
            stateHash=_state_hash(raw_state),
            redirectUri=redirect_uri,
            codeVerifier=flow.code_verifier,
            expiresAt=_iso(_now() + timedelta(minutes=10)),
        )
    )
    session.commit()
    return {"authorizationUrl": authorization_url}


@router.get("/callback", name="gmail_callback")
def gmail_callback(request: Request, state: str, user: CurrentUser, session: Session = Depends(get_session)):
    saved = session.exec(
        select(GmailOAuthState).where(
            GmailOAuthState.userId == user.id,
            GmailOAuthState.stateHash == _state_hash(state),
        )
    ).first()
    if saved is None or datetime.fromisoformat(saved.expiresAt.replace("Z", "+00:00")) <= _now():
        raise HTTPException(status_code=400, detail="Invalid or expired Gmail connection request")

    flow = Flow.from_client_secrets_file(
        str(WEB_CREDENTIALS_FILE),
        scopes=SCOPES,
        state=state,
        code_verifier=saved.codeVerifier,
        autogenerate_code_verifier=False,
    )
    flow.redirect_uri = saved.redirectUri
    # The app may sit behind Tailscale Serve or another TLS-terminating
    # reverse proxy. In that case request.url can appear to FastAPI as the
    # proxy's internal http://127.0.0.1 URL, which oauthlib correctly rejects
    # as insecure and which does not match the redirect URI sent to Google.
    # The redirect URI was captured server-side when the flow started and
    # the random state has just been validated, so rebuild the response URL
    # from that trusted public HTTPS URI plus Google's returned query string.
    authorization_response = f"{saved.redirectUri}?{request.url.query}"
    try:
        flow.fetch_token(authorization_response=authorization_response)
        credentials = flow.credentials
    except Exception as exc:
        logger.exception("Gmail OAuth token exchange failed")
        raise HTTPException(
            status_code=502,
            detail=f"Gmail token exchange failed ({type(exc).__name__}). Start a new connection and try again.",
        ) from exc

    try:
        service = build("gmail", "v1", credentials=credentials, cache_discovery=False)
        connected_email = service.users().getProfile(userId="me").execute().get("emailAddress")
    except Exception as exc:
        logger.exception("Gmail profile lookup failed")
        raise HTTPException(
            status_code=502,
            detail=f"Gmail profile lookup failed ({type(exc).__name__}). Confirm the Gmail API is enabled.",
        ) from exc
    existing = session.exec(select(GmailCredential).where(GmailCredential.userId == user.id)).first()
    if existing is None:
        existing = GmailCredential(userId=user.id, credentialsJson=credentials.to_json(), connectedEmail=connected_email, updatedAt=_iso(_now()))
    else:
        existing.credentialsJson = credentials.to_json()
        existing.connectedEmail = connected_email
        existing.updatedAt = _iso(_now())
    session.add(existing)
    session.delete(saved)
    session.commit()
    return RedirectResponse(f"{FRONTEND_URL.rstrip('/')}?gmail=connected", status_code=303)


@router.delete("/connection", status_code=204)
def disconnect_gmail(user: CurrentUser, session: Session = Depends(get_session)):
    credential = session.exec(select(GmailCredential).where(GmailCredential.userId == user.id)).first()
    if credential is not None:
        session.delete(credential)
        session.commit()
