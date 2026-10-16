import os
import threading
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from openai import OpenAI
from sqlalchemy.exc import IntegrityError
from sqlmodel import Session, select

from app.auth import CurrentUser
from app.database import get_session
from app.mail.extractor import extract_expense_hybrid
from app.mail.gmail_client import GmailNotAuthorizedError, get_gmail_service, get_message, list_message_ids
from app.models import (
    DEFAULT_CATEGORIES,
    DEFAULT_POOL_NAME,
    AccountEmail,
    AccountPool,
    ArchivedAccountPool,
    BankAccount,
    CategoryOption,
    GmailCredential,
    ProcessedEmail,
    Transaction,
    TransactionType,
)

router = APIRouter(prefix="/agent", tags=["agent"])

# Fallback only — used when no BankAccount has any Gmail address
# configured yet (e.g. a fresh install that hasn't added one via the UI).
# Once at least one account has one, it fully replaces this env var;
# GMAIL_QUERY is never consulted again.
FALLBACK_QUERY = os.getenv("GMAIL_QUERY", "newer_than:14d")
# Listing Gmail message IDs is cheap; model classification is the slow and
# metered part. Keep these limits separate so a short request can still see
# and gradually drain an older backlog across repeated syncs.
DEFAULT_SCAN_RESULTS = int(os.getenv("MAIL_SYNC_MAX_RESULTS", "50"))
DEFAULT_PROCESS_RESULTS = int(os.getenv("MAIL_SYNC_PROCESS_MAX_RESULTS", "10"))
NVIDIA_BASE_URL = "https://integrate.api.nvidia.com/v1"

# A sync can take minutes (one Gmail fetch + LLM call per email, done one
# at a time) — this guards against two overlapping syncs racing on the
# same "which messages are new" snapshot, which otherwise wastes an
# entire run's worth of real API calls (see sync_mail's per-message
# commit below for why a race there is merely wasted work, not corrupted
# data — this lock just avoids paying for it at all).
_sync_lock = threading.Lock()


def _accounts_with_email(session: Session, user_id: str) -> tuple[list[BankAccount], dict[str, list[str]]]:
    """
    Every bank account with at least one Gmail sender address, plus a
    mapping of accountId -> all of its addresses (a bank often alerts from
    more than one). Two separate values rather than one dict keyed by
    BankAccount — SQLModel table rows aren't hashable.
    """
    user_accounts = session.exec(select(BankAccount).where(BankAccount.userId == user_id)).all()
    user_account_ids = [account.id for account in user_accounts]
    if not user_account_ids:
        return [], {}
    emails = session.exec(select(AccountEmail).where(AccountEmail.accountId.in_(user_account_ids))).all()  # type: ignore[union-attr]
    if not emails:
        return [], {}
    addresses_by_account_id: dict[str, list[str]] = {}
    for e in emails:
        addresses_by_account_id.setdefault(e.accountId, []).append(e.address)
    accounts = session.exec(
        select(BankAccount).where(BankAccount.id.in_(addresses_by_account_id.keys()))  # type: ignore[union-attr]
    ).all()
    return accounts, addresses_by_account_id


def _build_query(addresses_by_account_id: dict[str, list[str]]) -> str:
    """
    OR together every configured sender address across every account so
    one sync covers all of them, e.g.
    `(from:a@bank.com OR from:b@bank.com) newer_than:14d`. Falls back to
    the static GMAIL_QUERY env var only if no account has any address set
    yet.
    """
    if not addresses_by_account_id:
        return FALLBACK_QUERY
    senders = " OR ".join(
        f"from:{address}" for addresses in addresses_by_account_id.values() for address in addresses
    )
    return f"({senders}) newer_than:14d"


def _match_account(
    sender_header: str,
    mail_accounts: list[BankAccount],
    addresses_by_account_id: dict[str, list[str]],
    default_account: BankAccount,
) -> BankAccount:
    """
    Which configured bank account did this email come from? Matched by
    substring against the raw "From" header (e.g. "HDFC Bank InstaAlerts
    <alerts@hdfcbank.bank.in>") rather than an exact-equality parse, since
    the header carries a display name alongside the address — checked
    against every address the account has, not just one. Falls back to
    the default Cash account — shouldn't happen in practice, since
    the Gmail query itself only ever returns messages from a configured
    sender, but a fallback here is cheap insurance against a query built
    from stale account state.
    """
    sender_lower = sender_header.lower()
    for account in mail_accounts:
        addresses = addresses_by_account_id.get(account.id, [])
        if any(address.lower() in sender_lower for address in addresses):
            return account
    return default_account


def _pool_for(session: Session, account: BankAccount, is_business: bool) -> str:
    """
    Pools are per-account and user-configurable now, so "Business" isn't
    guaranteed to exist on whichever account this email matched (the user
    may have removed it, or never added one) — fall back to Personal
    rather than tagging a transaction to a pool the account doesn't have.
    """
    if not is_business:
        return DEFAULT_POOL_NAME
    has_business_pool = session.exec(
        select(AccountPool).where(AccountPool.accountId == account.id, AccountPool.name == "Business")
    ).first()
    business_is_archived = session.exec(
        select(ArchivedAccountPool).where(
            ArchivedAccountPool.accountId == account.id,
            ArchivedAccountPool.poolName == "Business",
        )
    ).first()
    return "Business" if has_business_pool is not None and business_is_archived is None else DEFAULT_POOL_NAME


@router.post("/sync-mail")
def sync_mail(user: CurrentUser, session: Session = Depends(get_session)):
    """
    Fetch recent emails, ask an NVIDIA NIM-hosted model to classify+extract
    each one, and insert a Transaction (source="Email") for anything that
    looks like a real charge — attributed to whichever configured bank
    account's sender address matched. Already-seen message IDs (per
    ProcessedEmail) are skipped without re-fetching or re-classifying them.
    """
    if not _sync_lock.acquire(blocking=False):
        raise HTTPException(status_code=409, detail="A mail sync is already running — try again in a moment.")

    try:
        return _run_sync(session, user.id)
    finally:
        _sync_lock.release()


def _run_sync(session: Session, user_id: str):
    gmail_credential = session.exec(
        select(GmailCredential).where(GmailCredential.userId == user_id)
    ).first()
    if gmail_credential is None:
        raise HTTPException(status_code=409, detail="Connect Gmail before syncing mail.")
    try:
        service, refreshed_json = get_gmail_service(gmail_credential.credentialsJson)
        if refreshed_json:
            gmail_credential.credentialsJson = refreshed_json
            gmail_credential.updatedAt = datetime.now(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")
            session.add(gmail_credential)
            session.commit()
    except GmailNotAuthorizedError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc

    nvidia_api_key = os.getenv("NVIDIA_API_KEY")
    if not nvidia_api_key:
        raise HTTPException(
            status_code=503,
            detail="NVIDIA_API_KEY not configured. Set it in backend/.env — get one at build.nvidia.com.",
        )
    # Do not let one slow or stalled NIM request hold the entire mail-sync
    # lock indefinitely. The SDK retries once, then records that email in
    # the response's errors list and continues with the remaining messages.
    llm_client = OpenAI(
        base_url=NVIDIA_BASE_URL,
        api_key=nvidia_api_key,
        timeout=30.0,
        max_retries=1,
    )

    default_account = session.exec(
        select(BankAccount).where(BankAccount.userId == user_id, BankAccount.isDefault == True)  # noqa: E712
    ).first()
    if default_account is None:
        raise HTTPException(status_code=500, detail="No default Cash account found.")

    mail_accounts, mail_addresses = _accounts_with_email(session, user_id)
    query = _build_query(mail_addresses)

    categories = [
        row.name for row in session.exec(select(CategoryOption).where(CategoryOption.userId == user_id)).all()
    ] or DEFAULT_CATEGORIES

    candidate_ids = list_message_ids(service, query, DEFAULT_SCAN_RESULTS)
    already_seen = set(
        session.exec(
            select(ProcessedEmail.messageId).where(
                ProcessedEmail.userId == user_id,
                ProcessedEmail.messageId.in_(candidate_ids),
            )
        ).all()
    )
    # candidate_ids comes back newest-first from Gmail. Process oldest-first
    # instead: on the free tier's tight per-minute quota, only the first few
    # calls in a sync actually succeed before 429s kick in — newest-first
    # would mean a backlog of older pending emails keeps losing its turn to
    # whatever's freshest each sync, and never clears.
    unseen_ids = [mid for mid in reversed(candidate_ids) if mid not in already_seen]
    new_ids = unseen_ids[:DEFAULT_PROCESS_RESULTS]

    added = 0
    skipped = 0
    rule_parsed = 0
    ai_classified = 0
    template_drift = 0
    errors: list[str] = []
    now = datetime.now(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")

    for message_id in new_ids:
        try:
            email = get_message(service, message_id)
            extracted, extraction_source = extract_expense_hybrid(
                llm_client, email.subject, email.sender, email.body_text, categories
            )
            if extraction_source == "rules":
                rule_parsed += 1
            else:
                ai_classified += 1
                if extraction_source == "ai_template_drift":
                    template_drift += 1
                    # A transaction-shaped HDFC alert that no longer fits
                    # the known template is never allowed into the ledger
                    # with partial/guessed fields. Leave it unprocessed so
                    # it can be reviewed or retried after the parser learns
                    # the new format.
                    if (
                        not extracted.is_transaction
                        or not extracted.merchant
                        or not extracted.amount
                        or not extracted.type
                    ):
                        raise ValueError(
                            "HDFC template drift: AI fallback could not validate every required field"
                        )

            if extracted.is_transaction and extracted.amount:
                category_value = extracted.category or "Other"
                type_value = extracted.type.value if extracted.type else TransactionType.DEBIT.value
                # A confidently-identified transaction with a real amount
                # shouldn't get silently dropped just because merchant
                # extraction came back empty (seen in practice: a correctly
                # classified Rs.10 credit with the sender's name right there
                # in the email, but the model left merchant blank anyway) —
                # fall back to a generic label rather than losing the entry.
                merchant_value = extracted.merchant or "Unknown"
                account = _match_account(email.sender, mail_accounts, mail_addresses, default_account)
                transaction = Transaction(
                    userId=user_id,
                    accountId=account.id,
                    merchant=merchant_value,
                    amount=extracted.amount,
                    category=category_value,
                    type=type_value,
                    source="Email",
                    date=email.received_at,
                    pool=_pool_for(session, account, extracted.is_business),
                )
                session.add(transaction)
                session.add(
                    ProcessedEmail(
                        userId=user_id,
                        messageId=message_id,
                        is_transaction=True,
                        transaction_id=transaction.id,
                        processed_at=now,
                    )
                )
                is_added = True
            else:
                session.add(
                    ProcessedEmail(
                        userId=user_id,
                        messageId=message_id,
                        is_transaction=False,
                        skipped_reason="not a recognized transaction",
                        processed_at=now,
                    )
                )
                is_added = False

            # Committing per message (not once at the end) means a whole
            # sync's worth of real Gmail/LLM work — the expensive part —
            # never gets thrown away over one bad message: each email's
            # own commit is durable the moment it succeeds, independent of
            # whatever else in the batch fails afterward.
            session.commit()
            if is_added:
                added += 1
            else:
                skipped += 1
        except IntegrityError:
            # Only realistic cause here: another sync committed this same
            # message_id in between our dedupe check and this commit (the
            # _sync_lock above should prevent that within this process, but
            # this stays safe if that's ever bypassed — e.g. multiple
            # backend processes). Not a real failure — it's already
            # recorded — so just move on rather than surfacing it as an
            # error.
            session.rollback()
        except Exception as exc:  # noqa: BLE001 — one bad email shouldn't fail the whole sync
            session.rollback()
            errors.append(f"{message_id}: {exc}")

    return {
        "query": query,
        "scanned": len(new_ids),
        "already_processed": len(candidate_ids) - len(unseen_ids),
        "deferred": len(unseen_ids) - len(new_ids),
        "added": added,
        "skipped": skipped,
        "rule_parsed": rule_parsed,
        "ai_classified": ai_classified,
        "template_drift": template_drift,
        "errors": errors,
    }
