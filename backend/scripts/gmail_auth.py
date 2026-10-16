"""
One-time interactive Gmail authorization.

Run this yourself, locally, once:

    cd backend
    source .venv/bin/activate
    python scripts/gmail_auth.py

It opens a browser window for you to sign in and approve read-only Gmail
access, then writes the resulting token to GMAIL_TOKEN_FILE (default
token.json) next to this script's working directory. The backend reads
that file on every /api/agent/sync-mail call and refreshes it automatically
— you should never need to run this again unless the token file is deleted
or access is revoked.

Prerequisite: a Google Cloud project with the Gmail API enabled and an
OAuth 2.0 "Desktop app" client ID, downloaded as JSON and saved at
GMAIL_CREDENTIALS_FILE (default credentials.json). See backend/README.md
for the exact console steps.
"""
import os

from google_auth_oauthlib.flow import InstalledAppFlow

# Deliberately duplicated from app/mail/gmail_client.py rather than imported —
# this script is invoked directly (`python scripts/gmail_auth.py`), and
# Python doesn't put the backend/ root on sys.path for that invocation style,
# so `import app...` would fail. Keep these two in sync if either changes.
SCOPES = ["https://www.googleapis.com/auth/gmail.readonly"]
CREDENTIALS_FILE = os.getenv("GMAIL_CREDENTIALS_FILE", "credentials.json")
TOKEN_FILE = os.getenv("GMAIL_TOKEN_FILE", "token.json")


def main() -> None:
    if not os.path.exists(CREDENTIALS_FILE):
        raise SystemExit(
            f"Missing {CREDENTIALS_FILE}. Download it from Google Cloud Console "
            "(APIs & Services > Credentials > your OAuth client > Download JSON) "
            "and save it there — see backend/README.md."
        )

    flow = InstalledAppFlow.from_client_secrets_file(CREDENTIALS_FILE, SCOPES)
    creds = flow.run_local_server(port=0)

    with open(TOKEN_FILE, "w") as f:
        f.write(creds.to_json())

    print(f"Authorized. Token saved to {TOKEN_FILE} — you can now call /api/agent/sync-mail.")


if __name__ == "__main__":
    main()
