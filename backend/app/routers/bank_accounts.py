from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session, select

from app.auth import CurrentUser
from app.database import get_session
from app.models import (
    DEFAULT_POOL_NAME,
    AccountEmail,
    AccountPool,
    ArchivedAccountPool,
    BankAccount,
    PoolAllocationEvent,
    Transaction,
)
from app.schemas import (
    AddEmailInput,
    BankAccountInput,
    BankAccountOut,
    ManagePoolsInput,
    PoolAllocationEventOut,
    PoolOut,
    PoolTransferInput,
)

router = APIRouter(prefix="/bank-accounts", tags=["bank-accounts"])


def _now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")


def _pools_for(session: Session, account_id: str) -> list[AccountPool]:
    return session.exec(
        select(AccountPool).where(AccountPool.accountId == account_id).order_by(AccountPool.createdAt)
    ).all()


def _emails_for(session: Session, account_id: str) -> list[AccountEmail]:
    return session.exec(
        select(AccountEmail).where(AccountEmail.accountId == account_id).order_by(AccountEmail.createdAt)
    ).all()


def _archives_for(session: Session, account_id: str) -> list[ArchivedAccountPool]:
    return session.exec(select(ArchivedAccountPool).where(ArchivedAccountPool.accountId == account_id)).all()


def _events_for(session: Session, account_id: str) -> list[PoolAllocationEvent]:
    return session.exec(
        select(PoolAllocationEvent)
        .where(PoolAllocationEvent.accountId == account_id)
        .order_by(PoolAllocationEvent.createdAt)
    ).all()


def _active_pools_for(session: Session, account_id: str) -> list[AccountPool]:
    archived = {row.poolName for row in _archives_for(session, account_id)}
    return [pool for pool in _pools_for(session, account_id) if pool.name not in archived]


def _live_pool_amount(session: Session, account: BankAccount, pool: AccountPool) -> float:
    """
    This pool's current live amount — its startingAmount plus every
    credit/debit since anchoredAt tagged to it, mirroring computePools in
    the frontend's types.ts (kept in sync with that function; a pool
    transfer is the one backend operation that needs the real live number,
    everywhere else the frontend already has transactions loaded and
    computes it itself). No anchoredAt means no transaction counts yet,
    same as computePools.
    """
    amount = pool.startingAmount
    if not account.anchoredAt:
        return amount

    transactions = session.exec(
        select(Transaction).where(Transaction.accountId == account.id, Transaction.date >= account.anchoredAt)
    ).all()
    for tx in transactions:
        sign = 1 if tx.type == "Credit" else -1
        primary_pool = tx.pool or DEFAULT_POOL_NAME
        if tx.isAllocated and tx.allocationPool and tx.allocationAmount is not None:
            if tx.allocationPool == pool.name:
                amount += sign * tx.allocationAmount
            if primary_pool == pool.name:
                amount += sign * (tx.amount - tx.allocationAmount)
        elif primary_pool == pool.name:
            amount += sign * tx.amount
    for event in _events_for(session, account.id):
        if event.createdAt < account.anchoredAt:
            continue
        if event.fromPool == pool.name:
            amount -= event.amount
        if event.toPool == pool.name:
            amount += event.amount
    return amount


def _serialize(session: Session, account: BankAccount) -> BankAccountOut:
    pools = _pools_for(session, account.id)
    archive_by_name = {row.poolName: row for row in _archives_for(session, account.id)}
    active_pools = [pool for pool in pools if pool.name not in archive_by_name]
    events = _events_for(session, account.id)
    emails = _emails_for(session, account.id)
    def pool_out(pool: AccountPool) -> PoolOut:
        archived = archive_by_name.get(pool.name)
        return PoolOut(
            id=pool.id,
            name=pool.name,
            startingAmount=pool.startingAmount,
            isAuto=pool.isAuto,
            isDefault=pool.isDefault,
            createdAt=pool.createdAt,
            archivedAt=archived.archivedAt if archived else None,
        )
    return BankAccountOut(
        id=account.id,
        bank=account.bank,
        emailAddresses=[e.address for e in emails],
        isDefault=account.isDefault,
        isArchive=account.isArchive,
        balance=account.balance,
        minBalance=account.minBalance,
        anchoredAt=account.anchoredAt,
        pools=[pool_out(pool) for pool in active_pools],
        poolHistory=[pool_out(pool) for pool in pools],
        allocationEvents=[
            PoolAllocationEventOut(
                id=event.id,
                fromPool=event.fromPool,
                toPool=event.toPool,
                amount=event.amount,
                createdAt=event.createdAt,
            )
            for event in events
        ],
    )


@router.get("", response_model=list[BankAccountOut])
def list_bank_accounts(user: CurrentUser, session: Session = Depends(get_session)):
    """GET /api/bank-accounts — every bank account being tracked, including the built-in Cash one, with their pools."""
    accounts = session.exec(
        select(BankAccount).where(BankAccount.userId == user.id).order_by(BankAccount.createdAt)
    ).all()
    return [_serialize(session, a) for a in accounts]


@router.post("", response_model=BankAccountOut, status_code=201)
def add_bank_account(payload: BankAccountInput, user: CurrentUser, session: Session = Depends(get_session)):
    """
    POST /api/bank-accounts — add a new bank account. anchoredAt is set to
    now: everything from this moment on affects this account's live
    balance/pools. Every pool in payload.pools is created for it; if none
    is named "Personal" (the permanent default), one is added anyway with
    a starting amount of 0. Every address in payload.emailAddresses is
    created too — duplicates (case-sensitive) are collapsed to one.
    """
    account = BankAccount(
        userId=user.id,
        bank=payload.bank.strip(),
        balance=payload.balance,
        minBalance=payload.minBalance,
        anchoredAt=_now(),
        createdAt=_now(),
    )
    session.add(account)
    session.commit()
    session.refresh(account)

    now = _now()
    has_personal = False
    for pool in payload.pools:
        name = pool.name.strip()
        is_default = name == DEFAULT_POOL_NAME
        has_personal = has_personal or is_default
        session.add(
            AccountPool(
                accountId=account.id,
                name=name,
                startingAmount=pool.startingAmount,
                isAuto=pool.isAuto,
                isDefault=is_default,
                createdAt=now,
            )
        )
    if not has_personal:
        session.add(
            AccountPool(accountId=account.id, name=DEFAULT_POOL_NAME, startingAmount=0, isDefault=True, createdAt=now)
        )

    seen_addresses: set[str] = set()
    for raw_address in payload.emailAddresses:
        address = raw_address.strip()
        if not address or address in seen_addresses:
            continue
        seen_addresses.add(address)
        session.add(AccountEmail(accountId=account.id, address=address, createdAt=now))

    session.commit()

    return _serialize(session, account)


@router.put("/{account_id}", response_model=BankAccountOut)
def update_bank_account(
    account_id: str, payload: BankAccountInput, user: CurrentUser, session: Session = Depends(get_session)
):
    """
    PUT /api/bank-accounts/{id} — update bank identity and sender-email
    settings. Pool changes use the dedicated Manage Pools endpoint so this
    operation never re-anchors the account or rewrites history.

    payload.emailAddresses is likewise the full desired set — addresses
    not present anymore are removed, new ones are added.
    """
    account = session.get(BankAccount, account_id)
    if account is None or account.userId != user.id:
        raise HTTPException(status_code=404, detail="Bank account not found")

    account.bank = payload.bank.strip()
    session.add(account)
    now = _now()

    existing_emails = {e.address: e for e in _emails_for(session, account_id)}
    payload_addresses = {a.strip() for a in payload.emailAddresses if a.strip()}
    for address in payload_addresses:
        if address not in existing_emails:
            session.add(AccountEmail(accountId=account_id, address=address, createdAt=now))
    for address, email in existing_emails.items():
        if address not in payload_addresses:
            session.delete(email)

    session.commit()
    session.refresh(account)
    return _serialize(session, account)


@router.post("/{account_id}/emails", response_model=BankAccountOut)
def add_bank_account_email(account_id: str, payload: AddEmailInput, user: CurrentUser, session: Session = Depends(get_session)):
    """
    POST /api/bank-accounts/{id}/emails — add one Gmail sender address to
    an account without needing its full current setup (unlike PUT, which
    replaces the whole thing) — used by the "report a missing transaction"
    flow, where the fix is usually "mail sync never had this sender
    configured." No-op if the address is already there.
    """
    account = session.get(BankAccount, account_id)
    if account is None or account.userId != user.id:
        raise HTTPException(status_code=404, detail="Bank account not found")

    address = payload.address.strip()
    existing = session.exec(
        select(AccountEmail).where(AccountEmail.accountId == account_id, AccountEmail.address == address)
    ).first()
    if existing is None:
        session.add(AccountEmail(accountId=account_id, address=address, createdAt=_now()))
        session.commit()

    return _serialize(session, account)


@router.post("/{account_id}/pools/transfer", response_model=BankAccountOut)
def transfer_between_pools(account_id: str, payload: PoolTransferInput, user: CurrentUser, session: Session = Depends(get_session)):
    """
    POST /api/bank-accounts/{id}/pools/transfer — move `amount` from one of
    this account's pools to another (e.g. Personal -> Savings). Matched by
    name against the account's existing pools, same as PUT's pool
    matching. Shifts startingAmount on both rows rather than inserting a
    Transaction: this is a relabeling of money already in the account, not
    a real debit/credit, so the account's live total must stay unchanged
    (see computePools on the frontend, which sums every pool plus the
    reserved minimum into that total). Capped at fromPool's current live
    amount — see _live_pool_amount — so a pool can't be transferred into
    the negative this way.
    """
    account = session.get(BankAccount, account_id)
    if account is None or account.userId != user.id:
        raise HTTPException(status_code=404, detail="Bank account not found")

    if payload.fromPool == payload.toPool:
        raise HTTPException(status_code=400, detail="Pick two different pools to transfer between.")

    pools = {p.name: p for p in _active_pools_for(session, account_id)}
    from_pool = pools.get(payload.fromPool)
    to_pool = pools.get(payload.toPool)
    if from_pool is None or to_pool is None:
        raise HTTPException(status_code=404, detail="One of those pools doesn't exist on this account.")

    available = _live_pool_amount(session, account, from_pool)
    if payload.amount > available:
        raise HTTPException(
            status_code=400,
            detail=f"Only ₹{available:,.2f} is available in {from_pool.name} — can't transfer more than that.",
        )

    session.add(
        PoolAllocationEvent(
            accountId=account_id,
            fromPool=from_pool.name,
            toPool=to_pool.name,
            amount=payload.amount,
            createdAt=_now(),
        )
    )
    session.commit()
    session.refresh(account)
    return _serialize(session, account)


@router.put("/{account_id}/pools", response_model=BankAccountOut)
def manage_pools(account_id: str, payload: ManagePoolsInput, user: CurrentUser, session: Session = Depends(get_session)):
    """Apply a complete live pool allocation without touching transactions,
    the real account balance, or the account anchor. Differences are stored
    as timestamped pool-to-pool events; removed pools are archived."""
    account = session.get(BankAccount, account_id)
    if account is None or account.userId != user.id:
        raise HTTPException(status_code=404, detail="Bank account not found")

    desired: dict[str, float] = {}
    for row in payload.pools:
        name = row.name.strip()
        if name.lower() in {existing.lower() for existing in desired}:
            raise HTTPException(status_code=400, detail="Pool names must be unique.")
        desired[name] = row.amount
    if DEFAULT_POOL_NAME not in desired:
        raise HTTPException(status_code=400, detail="Personal is permanent and cannot be removed.")

    active_pools = _active_pools_for(session, account_id)
    current = {pool.name: _live_pool_amount(session, account, pool) for pool in active_pools}
    current_total = sum(current.values())
    desired_total = sum(desired.values())
    if abs(current_total - desired_total) > 0.01:
        raise HTTPException(
            status_code=400,
            detail=f"Pool allocations must total ₹{current_total:,.2f}; received ₹{desired_total:,.2f}.",
        )

    now = _now()
    all_pools = {pool.name: pool for pool in _pools_for(session, account_id)}
    archives = {row.poolName: row for row in _archives_for(session, account_id)}
    for name in desired:
        if name not in all_pools:
            pool = AccountPool(
                accountId=account_id,
                name=name,
                startingAmount=0,
                isDefault=name == DEFAULT_POOL_NAME,
                createdAt=now,
            )
            session.add(pool)
            all_pools[name] = pool
        archived = archives.get(name)
        if archived is not None:
            session.delete(archived)

    all_names = set(current) | set(desired)
    decreases = [[name, current.get(name, 0) - desired.get(name, 0)] for name in all_names]
    increases = [[name, desired.get(name, 0) - current.get(name, 0)] for name in all_names]
    decreases = [row for row in decreases if row[1] > 0.005]
    increases = [row for row in increases if row[1] > 0.005]
    decrease_index = 0
    increase_index = 0
    while decrease_index < len(decreases) and increase_index < len(increases):
        from_name, available = decreases[decrease_index]
        to_name, needed = increases[increase_index]
        amount = min(available, needed)
        session.add(
            PoolAllocationEvent(
                accountId=account_id,
                fromPool=str(from_name),
                toPool=str(to_name),
                amount=amount,
                createdAt=now,
            )
        )
        decreases[decrease_index][1] -= amount
        increases[increase_index][1] -= amount
        if decreases[decrease_index][1] <= 0.005:
            decrease_index += 1
        if increases[increase_index][1] <= 0.005:
            increase_index += 1

    for pool in active_pools:
        if pool.name not in desired and not pool.isDefault:
            session.add(ArchivedAccountPool(accountId=account_id, poolName=pool.name, archivedAt=now))

    session.commit()
    session.refresh(account)
    return _serialize(session, account)


@router.delete("/{account_id}", status_code=204)
def remove_bank_account(account_id: str, user: CurrentUser, session: Session = Depends(get_session)):
    """
    DELETE /api/bank-accounts/{id} — remove a bank account, its pools, and
    its Gmail addresses. Neither built-in account (Cash, or Deleted
    Accounts itself) can be deleted. Any transaction that belonged to the
    removed account moves to the built-in Deleted Accounts archive,
    retagged to Personal since a custom pool name from the deleted account
    has no meaning there — kept for reference rather than mixed into
    genuine Cash entries, but not live-tracked (Deleted Accounts has no
    anchoredAt, so it never contributes to any balance or pool total).
    """
    account = session.get(BankAccount, account_id)
    if account is None or account.userId != user.id:
        raise HTTPException(status_code=404, detail="Bank account not found")
    if account.isDefault or account.isArchive:
        raise HTTPException(status_code=400, detail="Can't delete a built-in account.")

    archive_account = session.exec(
        select(BankAccount).where(BankAccount.userId == user.id, BankAccount.isArchive == True)  # noqa: E712
    ).first()
    if archive_account is not None:
        orphaned = session.exec(select(Transaction).where(Transaction.accountId == account_id)).all()
        for tx in orphaned:
            tx.accountId = archive_account.id
            tx.pool = DEFAULT_POOL_NAME
            tx.isAllocated = False
            tx.allocationPool = None
            tx.allocationAmount = None
            session.add(tx)

    for pool in _pools_for(session, account_id):
        session.delete(pool)
    for email in _emails_for(session, account_id):
        session.delete(email)
    for event in _events_for(session, account_id):
        session.delete(event)
    for archive in _archives_for(session, account_id):
        session.delete(archive)

    session.delete(account)
    session.commit()
