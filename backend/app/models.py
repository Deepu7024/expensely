"""
Domain model. Field names are deliberately camelCase (not idiomatic Python)
so the JSON this API produces matches src/types.ts on the frontend byte for
byte, with no key translation on either side.
"""
from enum import Enum
from typing import Optional
from uuid import uuid4

from sqlalchemy import UniqueConstraint
from sqlmodel import Field, SQLModel


class Source(str, Enum):
    SMS = "SMS"
    CASH = "Cash"
    PHONEPE = "PhonePe"
    EMAIL = "Email"


class TransactionType(str, Enum):
    """Debit = money leaving the account. Credit = money coming in
    (refund, cashback, salary, transfer in)."""

    DEBIT = "Debit"
    CREDIT = "Credit"


DEFAULT_POOL_NAME = "Personal"


def new_id() -> str:
    return uuid4().hex


class User(SQLModel, table=True):
    id: str = Field(default_factory=new_id, primary_key=True)
    email: str = Field(index=True, unique=True)
    passwordHash: str
    createdAt: str


class AuthSession(SQLModel, table=True):
    id: str = Field(default_factory=new_id, primary_key=True)
    userId: str = Field(foreign_key="user.id", index=True)
    tokenHash: str = Field(index=True, unique=True)
    expiresAt: str
    createdAt: str


class GmailCredential(SQLModel, table=True):
    """User-scoped OAuth JSON; it is never returned by an API response or logged.
    Production storage should provide encryption at rest."""

    id: str = Field(default_factory=new_id, primary_key=True)
    userId: str = Field(foreign_key="user.id", index=True, unique=True)
    credentialsJson: str
    connectedEmail: Optional[str] = None
    updatedAt: str


class GmailOAuthState(SQLModel, table=True):
    id: str = Field(default_factory=new_id, primary_key=True)
    userId: str = Field(foreign_key="user.id", index=True)
    stateHash: str = Field(index=True, unique=True)
    redirectUri: str
    codeVerifier: Optional[str] = None
    expiresAt: str


class BankAccount(SQLModel, table=True):
    """
    One row per bank account being tracked. A real bank account can have
    one or more Gmail sender addresses the mail-sync agent scans for it
    (see AccountEmail — a bank often sends alerts from more than one
    address, e.g. transactions vs. statements) and a bank label; the
    built-in Cash account (isDefault=True, no emails) catches manual
    entries and anything that doesn't match a configured sender — it's
    seeded once at startup and can't be deleted.

    The built-in Deleted Accounts account (isArchive=True) is where a real
    bank account's transactions go when that account itself is deleted —
    kept for reference (still visible on the Transactions page, and
    selectable on its own via the dashboard's account filter) but never
    live-tracked: it has no anchoredAt, so it never contributes to any
    pool total or the combined balance. Keeping this separate from Cash
    means removing a bank account never quietly mixes its old history into
    genuine manual/cash entries.

    balance is the starting total; minBalance is a reserved buffer that
    never gets tagged to any pool. Everything else — Personal, Business,
    Savings, or any custom split — lives in its own AccountPool row (see
    that model), not as fixed columns here: which pools an account has,
    and how the starting balance is divided among them, is entirely
    user-configured per account. Personal always exists (isDefault=True on
    its AccountPool row) as the pool anything not explicitly tagged, or
    whose pool got deleted, falls back to.

    anchoredAt resets to now on every balance save, same reasoning as
    before: transactions dated before it are assumed already reflected in
    the entered numbers, so they don't get replayed on top of it.
    """

    id: str = Field(default_factory=new_id, primary_key=True)
    userId: Optional[str] = Field(default=None, foreign_key="user.id", index=True)
    bank: str
    isDefault: bool = False
    isArchive: bool = False
    balance: float = 0
    minBalance: float = 0
    anchoredAt: Optional[str] = None  # ISO 8601; None until first save
    createdAt: str  # ISO 8601


class AccountEmail(SQLModel, table=True):
    """
    One Gmail sender address the mail-sync agent scans on behalf of a
    BankAccount — a bank often alerts from more than one address (e.g. a
    transactions sender and a separate statements/promo sender), so this
    is a plain one-to-many rather than a single column. Matched by
    substring against the raw "From" header (see _match_account in
    agent.py), same as before.
    """

    id: str = Field(default_factory=new_id, primary_key=True)
    accountId: str = Field(foreign_key="bankaccount.id")
    address: str
    createdAt: str  # ISO 8601


class AccountPool(SQLModel, table=True):
    """
    One user-defined "bucket" of a BankAccount's balance — Personal,
    Business, Savings, or anything else the user names (an emergency fund,
    a specific savings goal, ...). startingAmount is this pool's share of
    the account's balance as of anchoredAt; from there it moves with every
    transaction tagged to it (Transaction.pool) or allocated into it
    (Transaction.allocationPool) — see computePools-equivalent logic in
    src/types.ts.

    isAuto marks the one pool (at most) whose startingAmount was derived
    as "whatever's left" — balance - minBalance - every other pool's
    startingAmount — rather than typed in directly; it's still just a
    plain number here; only the frontend form needs to know which pool to
    keep recalculating as the others change.

    isDefault marks the permanent Personal pool: every account gets one,
    seeded alongside it, and it can't be renamed or deleted — deleting any
    other pool reassigns its transactions here (see delete_bank_account and
    update_bank_account) so nothing is ever orphaned.
    """

    id: str = Field(default_factory=new_id, primary_key=True)
    accountId: str = Field(foreign_key="bankaccount.id")
    name: str
    startingAmount: float = 0
    isAuto: bool = False
    isDefault: bool = False
    createdAt: str  # ISO 8601


class PoolAllocationEvent(SQLModel, table=True):
    """Timestamped movement between two pools. Unlike a Transaction this
    never changes the bank balance; it only changes how existing money is
    organised, preserving the historical state before the movement."""

    id: str = Field(default_factory=new_id, primary_key=True)
    accountId: str = Field(foreign_key="bankaccount.id", index=True)
    fromPool: str
    toPool: str
    amount: float
    createdAt: str


class ArchivedAccountPool(SQLModel, table=True):
    """Marks a pool unavailable for new transactions without deleting its
    row or rewriting the historical transactions that used its name."""

    id: str = Field(default_factory=new_id, primary_key=True)
    accountId: str = Field(foreign_key="bankaccount.id", index=True)
    poolName: str
    archivedAt: str


class AppSettings(SQLModel, table=True):
    """
    Singleton row (id always 1) for settings not tied to any one bank
    account — currently just the monthly budget threshold the dashboard's
    Monthly Budget card measures personal spend against. Kept separate from
    per-account balance tracking (BankAccount) so every account shares one
    budget line rather than each needing its own, and so editing it never
    touches any account's anchoredAt.
    """

    id: Optional[int] = Field(default=None, primary_key=True)
    userId: Optional[str] = Field(default=None, foreign_key="user.id", index=True)
    monthlyBudget: float = 45000


class CategoryOption(SQLModel, table=True):
    """
    A category name available in the UI's category pickers and the mail-
    sync agent's classification prompt. Seeded once at startup with the
    original built-in set; users can add more from the UI. `name` is the
    only thing that matters — Transaction.category stores this same string
    directly, no separate id/foreign key.
    """

    __table_args__ = (UniqueConstraint("userId", "name", name="uq_category_user_name"),)

    id: str = Field(default_factory=new_id, primary_key=True)
    userId: Optional[str] = Field(default=None, foreign_key="user.id", index=True)
    name: str
    createdAt: str  # ISO 8601


DEFAULT_CATEGORIES = [
    "Food & Dining",
    "Entertainment",
    "Shopping",
    "Utilities",
    "Groceries",
    "Travel",
    "Health",
    "Business",
    "Personal",
    "Other",
]


class Transaction(SQLModel, table=True):
    """
    Mirrors the Transaction interface in src/types.ts.

    accountId ties every transaction to one BankAccount — for an Email-
    sourced transaction, whichever account has an AccountEmail matching
    the message's sender (see agent.py); for Cash/SMS/PhonePe/Reported
    entries, the default Cash account unless the user picks another.

    Two independent kinds of split, easy to conflate but answering
    different questions:
    - isSplit/shareAmount ("external split"): how much of this shared
      expense is actually mine, vs. someone else's? Only affects personal
      spend tracking (effectiveAmount) — the full amount still moved in
      the bank account, so it still counts in full toward the balance.
    - isAllocated/allocationPool/allocationAmount ("internal split"): of
      MY money, how much belongs in which of my own pools? E.g. a lump-sum
      deposit that's mostly Savings with a small Personal carve-out. The
      primary pool (`pool`) gets the remainder; allocationPool gets
      exactly allocationAmount. Based on the full amount, not shareAmount
      — these two splits are orthogonal.

    pool and allocationPool are free-typed strings, not a fixed enum — see
    AccountPool. They name one of the transaction's account's configured
    pools; "Personal" (the permanent default) if unset.
    """

    id: str = Field(default_factory=new_id, primary_key=True)
    userId: Optional[str] = Field(default=None, foreign_key="user.id", index=True)
    accountId: str = Field(foreign_key="bankaccount.id")
    merchant: str
    category: str
    amount: float
    shareAmount: Optional[float] = None
    date: str  # ISO 8601, e.g. 2026-08-21T09:12:00.000Z
    source: str
    type: str = TransactionType.DEBIT.value
    pool: str = DEFAULT_POOL_NAME
    isSplit: bool = False
    isAllocated: bool = False
    allocationPool: Optional[str] = None
    allocationAmount: Optional[float] = None
    note: Optional[str] = None
    # YYYY-MM-DD override for which calendar day this transaction's spend
    # counts toward on the Personal Spend by day page and "Today's Spend"
    # (see effectiveSpendDay in types.ts and personal_spend_by_day below)
    # — e.g. money spent yesterday but only paid back/logged today. `date`
    # itself (the real transaction timestamp — used for balance, ordering,
    # and anchoredAt scoping) is never touched by this; unset means it
    # counts toward its own date's day, same as before this field existed.
    effectiveDate: Optional[str] = None


class DayNote(SQLModel, table=True):
    """
    A free-text note attached to a calendar day — not tied to any one
    account, since the Personal Spend by day page can show a single
    account or every account combined either way. One row per day; an
    empty note deletes the row rather than storing a blank one (see
    set_day_note in expenses.py).
    """

    __table_args__ = (UniqueConstraint("userId", "date", name="uq_daynote_user_date"),)

    id: str = Field(default_factory=new_id, primary_key=True)
    userId: Optional[str] = Field(default=None, foreign_key="user.id", index=True)
    date: str  # YYYY-MM-DD
    note: str
    updatedAt: str  # ISO 8601


class ProcessedEmail(SQLModel, table=True):
    """
    Dedupe ledger for the mail-sync agent — one row per Gmail message ever
    looked at, so a re-sync never double-inserts or re-classifies the same
    email.
    """

    __table_args__ = (UniqueConstraint("userId", "messageId", name="uq_processed_user_message"),)

    id: str = Field(default_factory=new_id, primary_key=True)
    userId: Optional[str] = Field(default=None, foreign_key="user.id", index=True)
    messageId: str
    is_transaction: bool
    transaction_id: Optional[str] = None
    skipped_reason: Optional[str] = None
    processed_at: str  # ISO 8601, when this sync ran
