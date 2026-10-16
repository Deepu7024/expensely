# Expensely

Expensely is an open-source, self-hosted personal expense tracker. It combines
a React dashboard with a FastAPI backend, multi-account ledgers, configurable
money pools, and optional Gmail-based transaction import. Clone the repository
and run it on your own machine or infrastructure; there is no hosted Expensely
service.

> **Project status:** early-stage and actively developed. The core ledger,
> authentication, account isolation, manual entry, and Gmail import flows are
> usable, but the project has not received a professional security audit.

## What it does

- **See the whole picture:** accounts, cash, categories, budgets, and personal
  or business pools in one dashboard.
- **Keep control of the data:** run your own PostgreSQL database locally or
  in production.
- **Automate selectively:** connect Gmail to import supported bank transaction
  emails; the integration is optional.
- **Separate users safely:** every account has an isolated ledger and an
  HttpOnly cookie session.

## Stack

| Layer | Technology |
| --- | --- |
| Web app | React 19, TypeScript, Tailwind CSS |
| API | FastAPI, SQLModel, Pydantic |
| Storage | PostgreSQL |
| Optional integrations | Gmail OAuth, NVIDIA NIM |

## Quick start

Prerequisites: Python 3.11+, Node.js 20+, and Docker.

Start PostgreSQL from the repository root:

```bash
docker compose up -d db
```

### 1. Start the API

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate  # Windows: .venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env
uvicorn app.main:app --reload --port 8001
```

The API is available at <http://127.0.0.1:8001>; interactive documentation is
at <http://127.0.0.1:8001/docs>. `backend/.env.example` contains the
connection string for the local PostgreSQL container. The API requires
`DATABASE_URL` and creates its tables on first startup.

### 2. Start the web app

```bash
cd frontend
npm ci
cp .env.example .env.development.local
npm start
```

Open <http://localhost:3000>, register the first account, and add a bank
account or manual transaction. Gmail and NVIDIA credentials are not required
for the core expense-tracking workflow.

## Configuration

Safe templates live in [`backend/.env.example`](backend/.env.example) and
[`frontend/.env.example`](frontend/.env.example). Never commit `.env` files,
OAuth client JSON, Gmail tokens, database files, or real financial data.

To connect Gmail, create one Google OAuth web client for this installation,
save its downloaded JSON as `backend/credentials.web.json`, and set
`GMAIL_REDIRECT_URI=http://localhost:8001/api/gmail/callback` in `backend/.env`.
Add that same URL as an authorized redirect URI in Google Cloud, then restart
the API. Each Expensely user can authorize one Gmail inbox through this client;
connecting a different inbox for the same user replaces the previous one.
For the full setup, including test users and deployment URLs, see
[`backend/README.md`](backend/README.md#gmail-oauth-setup).

## Development

Run the backend tests:

```bash
cd backend
pip install -r requirements-dev.txt
python -m unittest discover -s tests
```

Run the frontend tests and production build:

```bash
cd frontend
npm run test:ci
npm run build
```

The same checks run in GitHub Actions for pushes and pull requests.

## Repository layout

```text
.
├── backend/       FastAPI application, migrations, mail import, and tests
├── frontend/      React application and unit tests
└── .github/       Continuous integration
```

## Security and privacy

Expensely handles sensitive financial and OAuth data. Review
the deployment settings before using it beyond local development. Use HTTPS,
PostgreSQL, `COOKIE_SECURE=true`, restricted CORS origins, and
`ALLOW_REGISTRATION=false` after creating the intended accounts.

See [SECURITY.md](SECURITY.md) for the supported version policy and how to
report a vulnerability without exposing account or financial data.

## License

Expensely is available under the [MIT License](LICENSE).
