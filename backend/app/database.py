import os

from sqlalchemy import inspect, text
from sqlalchemy.engine import make_url
from sqlmodel import Session, SQLModel, create_engine, select

DATABASE_URL = os.getenv("DATABASE_URL")
if not DATABASE_URL or make_url(DATABASE_URL).get_backend_name() != "postgresql":
    raise RuntimeError("DATABASE_URL must be a PostgreSQL URL; see backend/.env.example")

engine = create_engine(DATABASE_URL, echo=False)


def create_db_and_tables() -> None:
    # Importing the model module here makes this function safe to call from
    # maintenance scripts as well as FastAPI startup. SQLModel only creates
    # tables for model classes that have already been imported.
    from app import models  # noqa: F401

    SQLModel.metadata.create_all(engine)
    _migrate_legacy_postgres_schema()


def _migrate_legacy_postgres_schema() -> None:
    """Upgrade the pre-user PostgreSQL schema without discarding ledger data."""
    with engine.begin() as connection:
        inspector = inspect(connection)
        existing = set(inspector.get_table_names())

        def columns(table: str) -> set[str]:
            rows = connection.execute(
                text(
                    "SELECT column_name FROM information_schema.columns "
                    "WHERE table_schema = current_schema() AND table_name = :table"
                ),
                {"table": table},
            )
            return {row[0] for row in rows}

        for table in ("bankaccount", "transaction", "appsettings", "categoryoption", "daynote", "processedemail"):
            if table in existing and "userId" not in columns(table):
                connection.execute(text(f'ALTER TABLE "{table}" ADD COLUMN IF NOT EXISTS "userId" VARCHAR'))
                connection.execute(text(f'CREATE INDEX IF NOT EXISTS "ix_{table}_userId" ON "{table}" ("userId")'))

        if "gmailoauthstate" in existing and "codeVerifier" not in columns("gmailoauthstate"):
            connection.execute(text('ALTER TABLE gmailoauthstate ADD COLUMN IF NOT EXISTS "codeVerifier" VARCHAR'))

        if "appsettings" in existing:
            # The original singleton used a fixed integer primary key and
            # therefore had no sequence. Per-user settings need one row per
            # user, so make future ids allocate normally while preserving id=1.
            connection.execute(text("CREATE SEQUENCE IF NOT EXISTS appsettings_id_seq"))
            connection.execute(text("ALTER SEQUENCE appsettings_id_seq OWNED BY appsettings.id"))
            connection.execute(
                text(
                    "SELECT setval('appsettings_id_seq', "
                    "COALESCE((SELECT MAX(id) FROM appsettings), 0) + 1, false)"
                )
            )
            connection.execute(text("ALTER TABLE appsettings ALTER COLUMN id SET DEFAULT nextval('appsettings_id_seq')"))

        if "categoryoption" in existing:
            unique_constraints = inspect(connection).get_unique_constraints("categoryoption")
            for constraint in unique_constraints:
                if constraint.get("column_names") == ["name"] and constraint.get("name"):
                    quoted = connection.dialect.identifier_preparer.quote(constraint["name"])
                    connection.execute(text(f"ALTER TABLE categoryoption DROP CONSTRAINT {quoted}"))
            current_uniques = inspect(connection).get_unique_constraints("categoryoption")
            if not any(set(item.get("column_names") or []) == {"userId", "name"} for item in current_uniques):
                connection.execute(text('ALTER TABLE categoryoption ADD CONSTRAINT uq_category_user_name UNIQUE ("userId", name)'))

        if "daynote" in existing:
            daynote_columns = columns("daynote")
            if "id" not in daynote_columns:
                connection.execute(text("ALTER TABLE daynote ADD COLUMN IF NOT EXISTS id VARCHAR"))
                connection.execute(text("UPDATE daynote SET id = md5(random()::text || clock_timestamp()::text) WHERE id IS NULL"))
                connection.execute(text("ALTER TABLE daynote ALTER COLUMN id SET NOT NULL"))
                pk_name = inspect(connection).get_pk_constraint("daynote").get("name")
                if pk_name:
                    quoted = connection.dialect.identifier_preparer.quote(pk_name)
                    connection.execute(text(f"ALTER TABLE daynote DROP CONSTRAINT {quoted}"))
                connection.execute(text("ALTER TABLE daynote ADD PRIMARY KEY (id)"))
            daynote_uniques = inspect(connection).get_unique_constraints("daynote")
            if not any(set(item.get("column_names") or []) == {"userId", "date"} for item in daynote_uniques):
                connection.execute(text('ALTER TABLE daynote ADD CONSTRAINT uq_daynote_user_date UNIQUE ("userId", date)'))

        if "processedemail" in existing:
            processed_columns = columns("processedemail")
            if "message_id" in processed_columns and "messageId" not in processed_columns:
                connection.execute(text('ALTER TABLE processedemail RENAME COLUMN message_id TO "messageId"'))
                processed_columns = columns("processedemail")
            if "id" not in processed_columns:
                connection.execute(text("ALTER TABLE processedemail ADD COLUMN IF NOT EXISTS id VARCHAR"))
                connection.execute(text("UPDATE processedemail SET id = md5(random()::text || clock_timestamp()::text) WHERE id IS NULL"))
                connection.execute(text("ALTER TABLE processedemail ALTER COLUMN id SET NOT NULL"))
                pk_name = inspect(connection).get_pk_constraint("processedemail").get("name")
                if pk_name:
                    quoted = connection.dialect.identifier_preparer.quote(pk_name)
                    connection.execute(text(f"ALTER TABLE processedemail DROP CONSTRAINT {quoted}"))
                connection.execute(text("ALTER TABLE processedemail ADD PRIMARY KEY (id)"))
            processed_uniques = inspect(connection).get_unique_constraints("processedemail")
            if not any(set(item.get("column_names") or []) == {"userId", "messageId"} for item in processed_uniques):
                connection.execute(text('ALTER TABLE processedemail ADD CONSTRAINT uq_processed_user_message UNIQUE ("userId", "messageId")'))


def claim_legacy_data(session: Session, user_id: str) -> None:
    """Assign pre-authentication rows to the first account that registers."""
    for table in ("bankaccount", "transaction", "appsettings", "categoryoption", "daynote", "processedemail"):
        session.exec(text(f'UPDATE "{table}" SET "userId" = :user_id WHERE "userId" IS NULL').bindparams(user_id=user_id))
    session.commit()


def seed_user_defaults(session: Session, user_id: str) -> None:
    """
    Runs once at startup, after create_db_and_tables(): guarantees the two
    built-in bank accounts exist — Cash (manual entries and anything that
    doesn't match a configured mail-sync sender fall back to it) and
    Deleted Accounts (where a real bank account's transactions land when
    that account is removed, kept separate so removing an account never
    mixes its history into genuine Cash entries) — and that the default
    category set is registered. All of this is a no-op if already present,
    so it's safe to call on every restart.
    """
    from datetime import datetime, timezone

    from app.models import DEFAULT_CATEGORIES, DEFAULT_POOL_NAME, AccountPool, BankAccount, CategoryOption

    now = datetime.now(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")

    default_account = session.exec(
        select(BankAccount).where(BankAccount.userId == user_id, BankAccount.isDefault == True)  # noqa: E712
    ).first()
    if default_account is None:
        default_account = BankAccount(userId=user_id, bank="Cash", isDefault=True, createdAt=now)
        session.add(default_account)
        session.commit()
        session.refresh(default_account)

    has_personal_pool = session.exec(
        select(AccountPool).where(AccountPool.accountId == default_account.id, AccountPool.isDefault == True)  # noqa: E712
    ).first()
    if has_personal_pool is None:
        session.add(AccountPool(accountId=default_account.id, name=DEFAULT_POOL_NAME, startingAmount=0, isDefault=True, createdAt=now))

    archive_account = session.exec(
        select(BankAccount).where(BankAccount.userId == user_id, BankAccount.isArchive == True)  # noqa: E712
    ).first()
    if archive_account is None:
        archive_account = BankAccount(userId=user_id, bank="Deleted Accounts", isArchive=True, createdAt=now)
        session.add(archive_account)
        session.commit()
        session.refresh(archive_account)

    has_archive_personal_pool = session.exec(
        select(AccountPool).where(AccountPool.accountId == archive_account.id, AccountPool.isDefault == True)  # noqa: E712
    ).first()
    if has_archive_personal_pool is None:
        session.add(AccountPool(accountId=archive_account.id, name=DEFAULT_POOL_NAME, startingAmount=0, isDefault=True, createdAt=now))

    existing_categories = {
        row.name for row in session.exec(select(CategoryOption).where(CategoryOption.userId == user_id)).all()
    }
    for name in DEFAULT_CATEGORIES:
        if name not in existing_categories:
            session.add(CategoryOption(userId=user_id, name=name, createdAt=now))

    session.commit()


def get_session():
    with Session(engine) as session:
        yield session
