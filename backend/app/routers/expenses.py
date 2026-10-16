from collections import defaultdict
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session, select

from app.auth import CurrentUser
from app.database import get_session
from app.models import DEFAULT_POOL_NAME, BankAccount, CategoryOption, DayNote, Transaction, TransactionType
from app.schemas import (
    DayNoteInput,
    DayNoteOut,
    ExpenseUpdate,
    ManualExpenseInput,
    PersonalSpendByDayOut,
    PersonalSpendDayOut,
)

router = APIRouter(prefix="/expenses", tags=["expenses"])


def _default_account(session: Session, user_id: str) -> BankAccount:
    """The built-in, non-deletable Cash account manual entries fall back to."""
    account = session.exec(
        select(BankAccount).where(BankAccount.userId == user_id, BankAccount.isDefault == True)  # noqa: E712
    ).first()
    if account is None:
        raise HTTPException(
            status_code=500,
            detail="No default Cash account found — this should be seeded at startup.",
        )
    return account


def _ensure_category(session: Session, user_id: str, name: str) -> None:
    """Auto-registers a category name typed for the first time, so it shows up in future pickers too."""
    existing = session.exec(
        select(CategoryOption).where(CategoryOption.userId == user_id, CategoryOption.name == name)
    ).first()
    if existing is None:
        session.add(
            CategoryOption(
                userId=user_id, name=name,
                createdAt=datetime.now(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z"),
            )
        )


@router.get("", response_model=list[Transaction])
def list_expenses(user: CurrentUser, session: Session = Depends(get_session)):
    """GET /api/expenses — every transaction, newest first."""
    statement = select(Transaction).where(Transaction.userId == user.id).order_by(Transaction.date.desc())
    return session.exec(statement).all()


@router.get("/personal-by-day", response_model=PersonalSpendByDayOut)
def personal_spend_by_day(user: CurrentUser, accountId: Optional[str] = None, session: Session = Depends(get_session)):
    """
    GET /api/expenses/personal-by-day — every Personal-pool debit, grouped
    by calendar day (newest first, each day's own transactions newest
    first too). A transaction with an effectiveDate override groups under
    that day instead of its real date's — see effectiveDate on the
    Transaction model — so "spent yesterday, only logged today" lands in
    yesterday's bucket without changing the actual transaction timestamp.
    Scoped the same way the dashboard's Personal Spend card is: only
    transactions dated at/after each account's anchoredAt count (by their
    real date, regardless of any effectiveDate override), and an account
    with none set (never configured) contributes nothing.

    Pass accountId to scope to just one account, matching the dashboard's
    account filter set to a single account; omit it to combine every
    non-archived account, matching "All accounts (combined)". An unknown
    accountId (already deleted, say) just yields an empty result rather
    than an error — same "fail open" spirit as the frontend's own filter
    falling back to "all" when its current selection stops existing.
    """
    if accountId:
        account = session.get(BankAccount, accountId)
        accounts = [account] if account is not None and account.userId == user.id else []
    else:
        accounts = session.exec(
            select(BankAccount).where(BankAccount.userId == user.id, BankAccount.isArchive == False)  # noqa: E712
        ).all()

    by_day: dict[str, list[Transaction]] = defaultdict(list)
    grand_total = 0.0

    for account in accounts:
        if not account.anchoredAt:
            continue
        transactions = session.exec(
            select(Transaction).where(
                Transaction.accountId == account.id,
                Transaction.date >= account.anchoredAt,
                Transaction.pool == DEFAULT_POOL_NAME,
                Transaction.type == TransactionType.DEBIT.value,
            )
        ).all()
        for tx in transactions:
            # Same "effectiveAmount" reasoning as the frontend: a split's
            # share is what counts as personal spend, not the full amount.
            amount = tx.shareAmount if (tx.isSplit and tx.shareAmount is not None) else tx.amount
            grand_total += amount
            # date is ISO 8601 — first 10 chars are YYYY-MM-DD; an
            # effectiveDate override (also YYYY-MM-DD) takes priority.
            by_day[tx.effectiveDate or tx.date[:10]].append(tx)

    day_notes = {
        n.date: n.note for n in session.exec(select(DayNote).where(DayNote.userId == user.id)).all()
    }

    days = [
        PersonalSpendDayOut(
            date=day,
            total=sum(
                (tx.shareAmount if (tx.isSplit and tx.shareAmount is not None) else tx.amount) for tx in txs
            ),
            note=day_notes.get(day),
            transactions=sorted(txs, key=lambda t: t.date, reverse=True),
        )
        for day, txs in by_day.items()
    ]
    days.sort(key=lambda d: d.date, reverse=True)

    return PersonalSpendByDayOut(total=grand_total, days=days)


@router.put("/day-notes/{date}", response_model=DayNoteOut)
def set_day_note(date: str, payload: DayNoteInput, user: CurrentUser, session: Session = Depends(get_session)):
    """
    PUT /api/expenses/day-notes/{date} — set or clear the free-text note
    attached to a calendar day (YYYY-MM-DD), shown on the Personal Spend
    by day page. Not tied to any one account — one note per day, however
    many accounts contributed spend that day. An empty/whitespace-only
    note deletes the row rather than storing a blank one.
    """
    note = payload.note.strip()
    existing = session.exec(
        select(DayNote).where(DayNote.userId == user.id, DayNote.date == date)
    ).first()

    if not note:
        if existing is not None:
            session.delete(existing)
            session.commit()
        return DayNoteOut(date=date, note=None)

    now = datetime.now(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")
    if existing is not None:
        existing.note = note
        existing.updatedAt = now
        session.add(existing)
    else:
        session.add(DayNote(userId=user.id, date=date, note=note, updatedAt=now))
    session.commit()

    return DayNoteOut(date=date, note=note)


@router.post("/manual", response_model=Transaction, status_code=201)
def create_manual_expense(
    payload: ManualExpenseInput, user: CurrentUser, session: Session = Depends(get_session)
):
    """
    POST /api/expenses/manual — log a cash (or other manual) expense.
    Falls back to the default Cash account when accountId is omitted.
    """
    account = (
        session.get(BankAccount, payload.accountId)
        if payload.accountId
        else _default_account(session, user.id)
    )
    if account is None or account.userId != user.id:
        raise HTTPException(status_code=404, detail="Bank account not found")

    _ensure_category(session, user.id, payload.category)

    transaction = Transaction(
        userId=user.id,
        accountId=account.id,
        merchant=payload.merchant,
        amount=payload.amount,
        category=payload.category,
        source="Cash" if payload.isCashEntry else "SMS",
        date=datetime.now(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z"),
        type=payload.type,
        pool=payload.pool,
    )
    session.add(transaction)
    session.commit()
    session.refresh(transaction)
    return transaction


@router.patch("/{expense_id}", response_model=Transaction)
def update_expense(
    expense_id: str, payload: ExpenseUpdate, user: CurrentUser, session: Session = Depends(get_session)
):
    """
    PATCH /api/expenses/{id} — partial update used for changing which pool
    a transaction is tagged to, external split-share edits, internal
    pool-allocation edits, adding/clearing a note on one transaction, and
    setting/clearing its effectiveDate override — see ExpenseUpdate.
    """
    transaction = session.get(Transaction, expense_id)
    if transaction is None or transaction.userId != user.id:
        raise HTTPException(status_code=404, detail="Expense not found")

    updates = payload.model_dump(exclude_unset=True)
    if "category" in updates:
        _ensure_category(session, user.id, updates["category"])
    for field, value in updates.items():
        setattr(transaction, field, value)

    session.add(transaction)
    session.commit()
    session.refresh(transaction)
    return transaction
