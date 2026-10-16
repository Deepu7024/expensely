from contextlib import asynccontextmanager
from pathlib import Path

from dotenv import load_dotenv

# Must run before any of this project's own modules — several of them read
# GMAIL_*/NVIDIA_API_KEY as module-level constants at import time.
# An explicit path is deliberate: load_dotenv() with no path walks up parent
# directories looking for a ".env" and will happily load an unrelated one
# from somewhere above this repo (e.g. a home-directory .env from another
# project) — that's a real footgun, not a hypothetical one.
# This project deliberately treats backend/.env as its runtime configuration.
# Override inherited shell values so a stale local OAuth callback cannot win
# over the HTTPS callback configured for the running app.
load_dotenv(Path(__file__).resolve().parent.parent / ".env", override=True)

import os

from fastapi import Depends, FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.auth import get_current_user
from app.database import create_db_and_tables
from app.routers import agent, auth, bank_accounts, categories, expenses, gmail, settings


@asynccontextmanager
async def lifespan(app: FastAPI):
    create_db_and_tables()
    yield


app = FastAPI(title="Expensely API", version="0.1.0", lifespan=lifespan)

# Wide open for local development. Narrow this to your deployed frontend's
# origin(s) before shipping this anywhere real.
allowed_origins = [origin.strip() for origin in os.getenv("ALLOWED_ORIGINS", "http://localhost:3000").split(",") if origin.strip()]
app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router, prefix="/api")
protected = [Depends(get_current_user)]
app.include_router(expenses.router, prefix="/api", dependencies=protected)
app.include_router(agent.router, prefix="/api", dependencies=protected)
app.include_router(bank_accounts.router, prefix="/api", dependencies=protected)
app.include_router(settings.router, prefix="/api", dependencies=protected)
app.include_router(categories.router, prefix="/api", dependencies=protected)
app.include_router(gmail.router, prefix="/api", dependencies=protected)


@app.get("/")
def health():
    return {"status": "ok", "service": "expensely-api"}
