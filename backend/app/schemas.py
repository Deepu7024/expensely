"""Request bodies. Response bodies reuse app.models.Transaction directly."""
from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field, field_validator

from app.models import DEFAULT_POOL_NAME, Transaction, TransactionType


class ManualExpenseInput(BaseModel):
    """
    POST /api/expenses/manual — mirrors ManualExpenseInput in types.ts.
    pool picks which of the target account's pools this counts toward
    (see computePools in types.ts) — "Personal", the permanent default,
    unless the account has others and the user picks one. It's a free
    string, not validated against the account's actual pool list, same as
    category isn't validated against CategoryOption — an unrecognized name
    just won't show up tagged consistently in the UI.
    category is a free-typed string, not a fixed enum — see CategoryOption
    in models.py; any name already offered by GET /api/categories is safe
    to send, and posting a new one auto-registers it (see expenses.py).
    accountId is optional — omitted (or blank) defaults to the built-in
    Cash account.
    """

    merchant: str
    amount: float = Field(gt=0)
    category: str = Field(min_length=1, max_length=40)
    isCashEntry: bool = True
    pool: str = Field(default=DEFAULT_POOL_NAME, min_length=1, max_length=40)
    type: TransactionType = TransactionType.DEBIT
    accountId: Optional[str] = None


class PoolInput(BaseModel):
    """
    One pool in a POST/PUT /api/bank-accounts payload. isAuto marks the
    (at most one) pool whose startingAmount the frontend computed as
    "whatever's left" of the balance rather than typed in directly — see
    AccountPool in models.py; the backend just stores whatever number it's
    given either way.
    """

    name: str = Field(min_length=1, max_length=40)
    startingAmount: float = Field(default=0, ge=0)
    isAuto: bool = False


class BankAccountInput(BaseModel):
    """
    POST/PUT /api/bank-accounts — create or update one bank account's
    setup. pools is the full desired set of pools for this account —
    Personal, Business, Savings, or any custom split — replacing whatever
    was there before (see bank_accounts.py for how existing pools are
    matched by name, and how a removed pool's transactions get reassigned
    to Personal). A "Personal" entry is optional here — if omitted, the
    account's existing (or a fresh, zero-balance) Personal pool is kept as
    the permanent default, since it can't be removed.
    emailAddresses is the full desired set of Gmail sender addresses for
    this account — a bank often alerts from more than one address, so this
    replaces whatever was there before the same way pools does. Leave it
    empty for a manual-only account (mail sync only ever scans accounts
    that have at least one).
    """

    bank: str = Field(min_length=1)
    emailAddresses: list[str] = Field(default_factory=list)
    balance: float = Field(ge=0)
    minBalance: float = Field(default=0, ge=0)
    pools: list[PoolInput] = Field(default_factory=list)


class AddEmailInput(BaseModel):
    """POST /api/bank-accounts/{id}/emails — add one Gmail sender address to an account (no-op if already present)."""

    address: str = Field(min_length=1)


class PoolTransferInput(BaseModel):
    """
    POST /api/bank-accounts/{id}/pools/transfer — move money from one of an
    account's pools to another, e.g. carving out some Personal balance into
    Savings. Purely an internal re-labeling: it shifts both pools'
    startingAmount (see AccountPool) by the same amount, so the account's
    total balance is unaffected — nothing actually moves in or out of the
    bank account, unlike a real Transaction.
    """

    fromPool: str = Field(min_length=1, max_length=40)
    toPool: str = Field(min_length=1, max_length=40)
    amount: float = Field(gt=0)


class ManagedPoolInput(BaseModel):
    """One desired live pool allocation in the Manage Pools editor."""

    name: str = Field(min_length=1, max_length=40)
    amount: float = Field(ge=0)


class ManagePoolsInput(BaseModel):
    """The complete desired active pool allocation for one account."""

    pools: list[ManagedPoolInput] = Field(min_length=1)


class PoolOut(BaseModel):
    """One AccountPool row, as nested in GET/POST/PUT /api/bank-accounts responses."""

    id: str
    name: str
    startingAmount: float
    isAuto: bool
    isDefault: bool
    createdAt: str
    archivedAt: Optional[str] = None


class PoolAllocationEventOut(BaseModel):
    id: str
    fromPool: str
    toPool: str
    amount: float
    createdAt: str


class BankAccountOut(BaseModel):
    """A BankAccount row plus its pools — the response shape for every /api/bank-accounts endpoint."""

    id: str
    bank: str
    emailAddresses: list[str]
    isDefault: bool
    isArchive: bool
    balance: float
    minBalance: float
    anchoredAt: Optional[str]
    pools: list[PoolOut]
    poolHistory: list[PoolOut]
    allocationEvents: list[PoolAllocationEventOut]


class MonthlyBudgetInput(BaseModel):
    """
    PATCH /api/settings/monthly-budget — updates only the budget threshold.
    Deliberately separate from bank-account endpoints, which re-anchor on
    every save — the budget is just a spend threshold, shared across every
    account, unrelated to balance/pool tracking.
    """

    monthlyBudget: float = Field(ge=0)


class CategoryInput(BaseModel):
    """POST /api/categories — register a new category name for the pickers and the mail-sync prompt."""

    name: str = Field(min_length=1, max_length=40)


class CategoryRenameInput(BaseModel):
    """PATCH /api/categories/{name} — rename a category. Every transaction using the old name is updated to the new one."""

    name: str = Field(min_length=1, max_length=40)


class PersonalSpendDayOut(BaseModel):
    """One calendar day's worth of Personal-pool spend — see GET /api/expenses/personal-by-day."""

    date: str  # YYYY-MM-DD
    total: float
    note: Optional[str] = None
    transactions: list[Transaction]


class PersonalSpendByDayOut(BaseModel):
    """GET /api/expenses/personal-by-day — days sorted newest first, each with its own transactions sorted the same way."""

    total: float
    days: list[PersonalSpendDayOut]


class DayNoteInput(BaseModel):
    """PUT /api/expenses/day-notes/{date} — an empty/whitespace-only note deletes it rather than storing a blank one."""

    note: str = Field(default="", max_length=200)


class DayNoteOut(BaseModel):
    date: str  # YYYY-MM-DD
    note: Optional[str]


class ExpenseUpdate(BaseModel):
    """
    PATCH /api/expenses/{id} — used for the pool-tag change, external
    split-share edits, internal pool-allocation edits, adding a note to
    one transaction, and setting/clearing its effectiveDate override
    (which day its spend counts toward — see effectiveDate on the
    Transaction model). Every field is optional; only the ones sent are
    applied. The real `date` is never editable here — only effectiveDate,
    which never touches balance/anchoring/ordering, just day-bucketing on
    the Personal Spend by day page and "Today's Spend".
    """

    category: Optional[str] = Field(default=None, min_length=1, max_length=40)
    type: Optional[TransactionType] = None
    pool: Optional[str] = Field(default=None, min_length=1, max_length=40)
    isSplit: Optional[bool] = None
    shareAmount: Optional[float] = Field(default=None, gt=0)
    isAllocated: Optional[bool] = None
    allocationPool: Optional[str] = Field(default=None, min_length=1, max_length=40)
    allocationAmount: Optional[float] = Field(default=None, gt=0)
    note: Optional[str] = Field(default=None, max_length=200)
    effectiveDate: Optional[str] = Field(
        default=None,
        max_length=10,
        description="YYYY-MM-DD, or '' to clear the override and fall back to date's own day.",
    )

    @field_validator("effectiveDate")
    @classmethod
    def _validate_effective_date(cls, value: Optional[str]) -> Optional[str]:
        if not value:
            return value
        try:
            datetime.strptime(value, "%Y-%m-%d")
        except ValueError:
            raise ValueError("effectiveDate must be YYYY-MM-DD")
        return value
