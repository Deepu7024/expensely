"""
Thin wrapper around the Gmail API: load a stored OAuth token, list recent
messages, and pull each one's subject/sender/plain-text body.

The token itself is produced once, out of band, by scripts/gmail_auth.py —
this module only ever reads and refreshes it. See backend/README.md for the
one-time Google Cloud Console + auth-script setup.
"""
import base64
import json
import os
from dataclasses import dataclass
from datetime import datetime, timezone

from google.auth.exceptions import RefreshError
from google.auth.transport.requests import Request
from google.oauth2.credentials import Credentials
from googleapiclient.discovery import build

SCOPES = ["https://www.googleapis.com/auth/gmail.readonly"]

CREDENTIALS_FILE = os.getenv("GMAIL_CREDENTIALS_FILE", "credentials.json")
TOKEN_FILE = os.getenv("GMAIL_TOKEN_FILE", "token.json")


class GmailNotAuthorizedError(RuntimeError):
    """Raised when no valid token exists yet — the user needs to run the auth script."""


@dataclass
class EmailMessage:
    id: str
    subject: str
    sender: str
    body_text: str
    received_at: str  # ISO 8601


def _load_credentials(credentials_json: str | None = None) -> tuple[Credentials, str | None]:
    if credentials_json:
        creds = Credentials.from_authorized_user_info(json.loads(credentials_json), SCOPES)
    elif os.path.exists(TOKEN_FILE):
        # Legacy single-user fallback, imported into the first user's row
        # during registration. Kept so the migration is recoverable.
        creds = Credentials.from_authorized_user_file(TOKEN_FILE, SCOPES)
    else:
        raise GmailNotAuthorizedError("Connect Gmail from your Expensely account before syncing mail.")

    refreshed_json = None
    if creds.expired and creds.refresh_token:
        try:
            creds.refresh(Request())
        except RefreshError as exc:
            raise GmailNotAuthorizedError(
                "Gmail authorization expired and could not be refreshed. Reconnect Gmail in Expensely."
            ) from exc
        refreshed_json = creds.to_json()

    return creds, refreshed_json


def get_gmail_service(credentials_json: str | None = None):
    creds, refreshed_json = _load_credentials(credentials_json)
    return build("gmail", "v1", credentials=creds, cache_discovery=False), refreshed_json


def list_message_ids(service, query: str, max_results: int) -> list[str]:
    """IDs only — cheap, used to check against ProcessedEmail before fetching bodies."""
    ids: list[str] = []
    request = service.users().messages().list(userId="me", q=query, maxResults=min(max_results, 500))
    while request is not None and len(ids) < max_results:
        response = request.execute()
        ids.extend(m["id"] for m in response.get("messages", []))
        request = service.users().messages().list_next(request, response)
    return ids[:max_results]


def _decode_part(data: str) -> str:
    padded = data + "=" * (-len(data) % 4)
    return base64.urlsafe_b64decode(padded).decode("utf-8", errors="replace")


def _extract_plain_text(payload: dict) -> str:
    """Walk a Gmail message payload for the first text/plain part; falls back to text/html."""
    if payload.get("mimeType") == "text/plain" and payload.get("body", {}).get("data"):
        return _decode_part(payload["body"]["data"])

    html_fallback = None
    for part in payload.get("parts", []) or []:
        if part.get("mimeType") == "text/plain" and part.get("body", {}).get("data"):
            return _decode_part(part["body"]["data"])
        if part.get("mimeType") == "text/html" and part.get("body", {}).get("data") and html_fallback is None:
            html_fallback = _decode_part(part["body"]["data"])
        if part.get("parts"):
            nested = _extract_plain_text(part)
            if nested:
                return nested

    if html_fallback:
        # Good enough for LLM extraction — strip tags crudely rather than
        # pulling in a full HTML parser dependency for this. <style>/<script>
        # blocks must go first: a bare tag-strip regex removes the tags but
        # leaves their CONTENTS behind, so a template email's CSS (media
        # queries, selectors, etc.) ends up as a wall of noise ahead of the
        # actual message — confirmed to cause real misclassifications (a
        # transaction email judged "not a transaction" with the real content
        # buried under ~2800 chars of leftover CSS text).
        import re

        text = re.sub(r"<style[^>]*>.*?</style>", " ", html_fallback, flags=re.IGNORECASE | re.DOTALL)
        text = re.sub(r"<script[^>]*>.*?</script>", " ", text, flags=re.IGNORECASE | re.DOTALL)
        text = re.sub(r"<[^>]+>", " ", text)
        # Collapse the runs of blank lines/whitespace that HTML table/div
        # layouts leave behind, so the model sees signal, not padding.
        text = re.sub(r"[ \t]+", " ", text)
        text = re.sub(r"\n\s*\n+", "\n", text)
        return text.strip()

    return ""


def _header(headers: list[dict], name: str) -> str:
    for h in headers:
        if h.get("name", "").lower() == name.lower():
            return h.get("value", "")
    return ""


def get_message(service, message_id: str) -> EmailMessage:
    raw = service.users().messages().get(userId="me", id=message_id, format="full").execute()
    headers = raw.get("payload", {}).get("headers", [])
    body_text = _extract_plain_text(raw.get("payload", {}))

    internal_date_ms = int(raw.get("internalDate", "0"))
    received_at = (
        datetime.fromtimestamp(internal_date_ms / 1000, tz=timezone.utc)
        .isoformat(timespec="milliseconds")
        .replace("+00:00", "Z")
    )

    return EmailMessage(
        id=message_id,
        subject=_header(headers, "Subject"),
        sender=_header(headers, "From"),
        body_text=body_text[:6000],  # cap what we send to the model
        received_at=received_at,
    )
