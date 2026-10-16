# Expensely API

A FastAPI backend for the Expensely expense tracker. Response shapes match
`frontend/src/types.ts` field-for-field (camelCase JSON, no translation
layer needed on either side).

Multi-account, multi-pool by design: you can track more than one bank
account, and each account has its own user-defined set of "pools" (money
buckets) — Personal always exists and can't be removed, but Business,
Savings, or anything else you name are entirely optional and configurable
per account.

The API is multi-user too. Registration creates an isolated ledger with its
own accounts, transactions, categories, settings, day notes, processed Gmail
IDs, and Gmail credential. Authentication uses an opaque HttpOnly session
cookie and Argon2 password hashes. When upgrading the original single-user
schema, the first registered account claims the existing ledger; every later
account starts clean with its own built-in accounts and defaults.

## Endpoints

| Method | Path | Body | Notes |
|--------|------|------|-------|
| POST   | `/api/auth/register` | `{ email, password }` | Creates an isolated ledger and signs in |
| POST   | `/api/auth/login` | `{ email, password }` | Starts an HttpOnly cookie session |
| GET    | `/api/auth/me` | — | Returns the signed-in account, or 401 |
| POST   | `/api/auth/logout` | — | Revokes the account's sessions |
| GET    | `/api/gmail/status` | — | Gmail status for the signed-in account |
| POST   | `/api/gmail/connect` | — | Starts per-user Google OAuth |
| DELETE | `/api/gmail/connection` | — | Disconnects only the current user's Gmail |
| GET    | `/api/expenses` | — | All transactions, newest first |
| POST   | `/api/expenses/manual` | `{ merchant, amount, category, isCashEntry, pool, type, accountId? }` | Logs a manual/cash expense. `accountId` omitted → falls back to the built-in Cash account. Posting a new `category` auto-registers it. |
| PATCH  | `/api/expenses/{id}` | any of `{ category, type, pool, isSplit, shareAmount, isAllocated, allocationPool, allocationAmount }` | Partial update — pool re-tag, split-share edit, or allocation edit |
| GET    | `/api/bank-accounts` | — | Every bank account, including the two built-in ones (Cash, Deleted Accounts), each with its `pools` |
| POST   | `/api/bank-accounts` | `{ bank, emailAddress?, balance, minBalance, pools: [{ name, startingAmount, isAuto }] }` | Adds a bank account. A `pools` entry named "Personal" is optional — one is created either way |
| PUT    | `/api/bank-accounts/{id}` | same as POST | Updates a bank account and re-anchors it. `pools` is the *full* desired set — a name no longer present is deleted, its transactions reassigned to Personal |
| DELETE | `/api/bank-accounts/{id}` | — | Removes a bank account (not one of the two built-in ones). Its transactions move to the built-in Deleted Accounts archive, retagged to Personal — kept for reference, never live-tracked |
| GET    | `/api/categories` | — | Every category name available in the pickers and the mail-sync prompt |
| POST   | `/api/categories` | `{ name }` | Registers a new category (no-op if it already exists) |
| PATCH  | `/api/categories/{name}` | `{ name }` | Renames a category — every transaction using it moves to the new name. Renaming onto an existing name merges the two |
| DELETE | `/api/categories/{name}` | — | Deletes a category (not the built-in "Other"); its transactions move to Other |
| GET    | `/api/settings` | — | App-wide settings not tied to any account — currently just `monthlyBudget` |
| PATCH  | `/api/settings/monthly-budget` | `{ monthlyBudget }` | Updates the budget threshold. Never touches any account's balance/pools |
| POST   | `/api/agent/sync-mail` | — | Mail-reading agent — see below |

`GET /` is a plain health check.

Every other endpoint requires the signed-in session cookie and scopes reads
and mutations to that user.

## Pools

A pool is a named share of a bank account's balance — Personal, Business,
Savings, or anything else a user calls it. Every account gets a permanent
Personal pool it can't rename or delete; every other pool is optional and
fully user-configured (added, renamed, removed) per account, via
`BankAccountInput.pools` on the add/update endpoints.

A pool's `startingAmount` can be typed in directly, or left for the
frontend to compute as "whatever's left of the balance" (flagged back via
`isAuto` on the stored row, purely so the edit form knows which field to
leave blank again next time — the backend just stores whatever number it's
given).

Deleting a pool (by leaving its name out of a `PUT` update) reassigns any
transaction tagged to it — by `pool` or by `allocationPool` — onto
Personal, so nothing is ever orphaned.

## The mail-reading agent

`POST /api/agent/sync-mail` fetches recent Gmail messages across every
bank account that has an `emailAddress` configured, asks an NVIDIA
NIM-hosted model to classify each one (is this a transaction
notification?) and, if so, extract the merchant/amount/category/type
(Debit or Credit) and whether it looks like a business expense, then
inserts a `Transaction` with `source: "Email"` for every real match —
attributed to whichever account's sender address matched, tagged to that
account's Business pool if one exists and the model flagged it as
business, Personal otherwise. Already-seen message IDs are tracked in a
`ProcessedEmail` table so re-running the sync never double-inserts (a
failed classification isn't marked processed, so it's retried
automatically on the next sync).

The transaction's `date` comes from the email's own Gmail-assigned
timestamp (`internalDate`), not from anything parsed out of the email
body — the model is never asked for a date.

This is a single classification+extraction call per email (NIM's
OpenAI-compatible `chat.completions.create` with JSON mode, parsed and
validated against a Pydantic model afterward — NIM doesn't enforce a strict
response schema the way Gemini's `response_schema` did, so the exact JSON
shape is spelled out in the prompt instead) — not an open-ended agent loop,
which is the right amount of machinery for "read this email, tell me if
it's a charge."

### Gmail OAuth setup

**1. Create OAuth credentials for your installation**

The Gmail connection is optional. Each self-hosted installation needs its own
Google Cloud project and **one OAuth web client**, shared by all Expensely
users on that installation. The repository does not include a client or access
to the maintainer's test project. Expensely registration uses email and
password; Google authorization happens later, when a signed-in user selects
**Connect Gmail**.

1. Create your own project at [console.cloud.google.com](https://console.cloud.google.com/).
2. **APIs & Services → Library** → enable the **Gmail API**.
3. Configure the OAuth consent screen as **External** and add the
   `gmail.readonly` scope. For initial setup, leave the publishing status at
   **Testing** and add every Gmail account that will connect under **Test
   users**. Testing access is limited to listed users, and Gmail refresh
   tokens expire after seven days, so the user must reconnect. Google permits
   personal-use apps with fewer than 100 known users to continue without
   verification, subject to the unverified-app warning and user cap. A shared
   public deployment using one OAuth client needs a different verification plan
   for this restricted scope.
4. **APIs & Services → Credentials → Create Credentials → OAuth client ID**
   → Application type **Web application**.
5. Add the exact backend callback as an authorized redirect URI:
   `http://localhost:8001/api/gmail/callback` for the default local setup, or
   `https://api.example.com/api/gmail/callback` for a deployed backend. Use
   the same hostname the browser uses for API requests; `localhost` and
   `127.0.0.1` are different cookie hosts.
6. Download the web client JSON and save it as `backend/credentials.web.json`
   (gitignored). From the repository root, set these values in `backend/.env`:

   ```env
   GMAIL_WEB_CREDENTIALS_FILE=credentials.web.json
   GMAIL_REDIRECT_URI=http://localhost:8001/api/gmail/callback
   ```

   The credentials path is relative to the `backend/` directory when you run
   the API from there. For a deployed installation, use its exact HTTPS
   callback and set `FRONTEND_URL` to its frontend URL. Keep the JSON private.
7. Restart the API after changing `.env`, sign in to Expensely, and select
   **Connect Gmail**. Authorize the Gmail address you want to import from.

Each Expensely user has a separate Gmail authorization. The backend stores each
user's Google token in this installation's PostgreSQL database. **The current
app supports one Gmail inbox per Expensely user.** Connecting another Gmail
address while signed in as the same Expensely user replaces the previous
connection. Multiple bank accounts can still be tracked under that user.
A legacy `token.json` is imported only for the first account during migration.

**2. Add at least one bank account with a Gmail sender address**

Mail sync only ever scans accounts you've configured with an
`emailAddress` (Accounts view in the frontend, or `POST /api/bank-accounts`
directly). With none configured, sync falls back to the static
`GMAIL_QUERY` env var below.

**3. NVIDIA API key**

```bash
# backend/.env (create this file — gitignored)
NVIDIA_API_KEY=nvapi-...
```

Get a key at [build.nvidia.com](https://build.nvidia.com) — pick a model, then "Get API Key".

### Triggering a sync

Either `curl -X POST http://localhost:8001/api/agent/sync-mail`, or the
**Sync from Mail** button in the frontend header. Response shape:

```json
{ "query": "(from:a@bank.com OR from:b@bank.com) newer_than:14d", "scanned": 12, "already_processed": 3, "added": 2, "skipped": 10, "errors": [] }
```

### Configuration (optional, all in `backend/.env`)

| Variable | Default | Meaning |
|---|---|---|
| `GMAIL_CREDENTIALS_FILE` | `credentials.json` | Path to the downloaded OAuth client JSON |
| `GMAIL_TOKEN_FILE` | `token.json` | Where the authorized token is stored |
| `GMAIL_WEB_CREDENTIALS_FILE` | `credentials.web.json` | Web OAuth client used by per-user onboarding |
| `GMAIL_REDIRECT_URI` | callback route URL | Exact callback authorized in Google Cloud |
| `FRONTEND_URL` | `http://localhost:3000` | Redirect target after connecting Gmail |
| `COOKIE_SECURE` | `false` | Set to `true` for HTTPS deployments |
| `ALLOW_REGISTRATION` | `true` | Set to `false` after the first user for invite-only access |
| `GMAIL_QUERY` | `newer_than:14d` | Fallback Gmail search query, only used if no bank account has an `emailAddress` set yet |
| `MAIL_SYNC_MAX_RESULTS` | `50` | Number of recent Gmail message IDs checked for processed/unprocessed status |
| `MAIL_SYNC_PROCESS_MAX_RESULTS` | `10` | Maximum unprocessed emails classified per sync; repeated syncs drain the backlog oldest-first |

### Cost note

Each new email costs one NVIDIA NIM API call (`openai/gpt-oss-20b`,
set in `app/mail/extractor.py`). The app cheaply checks up to 50 message
IDs, then classifies at most 10 unseen messages per sync. Already-processed
messages are skipped before any model call, and repeated syncs drain the
remaining backlog oldest-first. If that model is
ever retired, check
[build.nvidia.com](https://build.nvidia.com) for a current instruction-tuned
model and update the `MODEL` constant.

## Run it locally

```bash
docker compose up -d db        # from the repository root
cd backend
python3 -m venv .venv
source .venv/bin/activate        # Windows: .venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env

uvicorn app.main:app --reload --port 8001
```

The first run creates the PostgreSQL tables. Each new user gets the default
categories and two built-in accounts (Cash and Deleted Accounts), each with
its Personal pool. The sample credentials in `compose.yaml` and
`.env.example` are for local development only.

The frontend defaults to `/api` and proxies that path to the local backend on
port 8001. Copy `frontend/.env.example` to a local environment file only when
you need to override that behavior.

## Storage

PostgreSQL is required in every environment. Set `DATABASE_URL` to a
PostgreSQL connection string. `compose.yaml` provides a local instance on
port `5433`; change both its port and `.env` if that port is occupied.
Use a managed PostgreSQL service and private credentials in production.

The backend tests create and drop a uniquely named PostgreSQL database. Run
them with a PostgreSQL `DATABASE_URL` whose user has `CREATEDB` permission;
they do not erase the application database.

## Deploying to Render

1. New **Web Service**, root directory `backend/`.
2. Build command: `pip install -r requirements.txt`
3. Start command: `uvicorn app.main:app --host 0.0.0.0 --port $PORT`
4. Attach a Render Postgres instance and set `DATABASE_URL` to its connection string.
5. Set `REACT_APP_API_BASE_URL` in the frontend hosting environment to this
   service's URL (ending in `/api`) before building the frontend.

## Project layout

```
backend/
  app/
    main.py            FastAPI app, CORS, lifespan (create tables + seed defaults), loads backend/.env
    models.py          BankAccount, AccountPool, Transaction, CategoryOption, AppSettings, ProcessedEmail tables + Source/TransactionType enums
    schemas.py          Request bodies: ManualExpenseInput, BankAccountInput/PoolInput, MonthlyBudgetInput, CategoryInput/CategoryRenameInput, ExpenseUpdate
    database.py          Engine/session setup, create_db_and_tables, seed_defaults
    mail/
      gmail_client.py     OAuth token load/refresh, message listing, HTML→text extraction
      extractor.py         NVIDIA NIM classification+extraction per email
    routers/
      expenses.py          List, manual-create, and patch transactions
      bank_accounts.py      Bank account + pool CRUD, including pool diff/reassignment on update, cascade on delete
      categories.py          Category CRUD (add/rename/delete)
      settings.py            App-wide settings (monthly budget)
      agent.py                POST /api/agent/sync-mail
  scripts/
    gmail_auth.py            One-time interactive Gmail OAuth (run manually, once)
  requirements.txt
```

## CORS

Set `ALLOWED_ORIGINS` to a comma-separated list of frontend origins. It
defaults to `http://localhost:3000`; credentialed cross-origin requests are
enabled only for listed origins.
