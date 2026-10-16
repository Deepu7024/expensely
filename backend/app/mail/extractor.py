"""
Turns one email's text into a structured expense (or a decision that it
isn't one) using an NVIDIA NIM-hosted model — a single classification+
extraction call per email, no agentic tool loop needed for this shape of
task.

NIM's OpenAI-compatible API supports JSON mode (response_format:
json_object) but, unlike Gemini's response_schema, doesn't enforce a exact
schema — so the shape is spelled out explicitly in the prompt, and the
response is parsed + validated against ExtractedExpense afterward.
"""
import json
import os
import re
from typing import Optional

from openai import OpenAI
from pydantic import BaseModel, ValidationError

from app.models import TransactionType

# Bank alert templates spell out the other party in a fairly fixed way —
# "Sender: NAME (VPA: ...)" for a credit, "to NAME" / "at NAME" for a debit.
# Used only as a fallback when the model's own merchant extraction comes
# back empty; a regex match here is free and instant, and this recurring
# format was confirmed (in production, not hypothetically) to make an 8B
# model miss the field on a real, non-trivial fraction of otherwise-correct
# extractions even at temperature 0.
_SENDER_NAME_RE = re.compile(r"\bsender:\s*([A-Za-z][A-Za-z .]{1,40}?)\s*\(", re.IGNORECASE)
_HDFC_AMOUNT_ACTION_RE = re.compile(
    r"(?:rs\.?|inr|₹)\s*([\d,]+(?:\.\d{1,2})?)\s+"
    r"(?:(?:has\s+been|is)\s+)?(?:successfully\s+)?(debited|credited)\b",
    re.IGNORECASE,
)
_HDFC_VPA_NAME_RE = re.compile(
    r"\b(?:towards|to|from)\s+VPA\s+[^\s(]+\s*\(([^)]+)\)",
    re.IGNORECASE,
)
_HDFC_RECEIVED_FROM_RE = re.compile(
    r"\b(?:received|credited)\s+from\s+([A-Za-z][A-Za-z .]{1,60}?)(?:\s+on\b|\s*\(|\.|,|$)",
    re.IGNORECASE,
)

_CATEGORY_KEYWORDS: list[tuple[str, tuple[str, ...]]] = [
    ("Business", ("aws", "azure", "google cloud", "openai", "figma", "github")),
    ("Food & Dining", ("zomato", "swiggy", "restaurant", "cafe", "coffee", "pastries", "momo")),
    ("Groceries", ("grocery", "groceries", "kirana", "supermarket", "freshmart")),
    ("Entertainment", ("netflix", "spotify", "cinema", "district")),
    ("Travel", ("uber", "ola", "indigo", "airline", "petrol", "fuel")),
    ("Health", ("pharmacy", "hospital", "apollo", "clinic")),
    ("Shopping", ("amazon", "flipkart", "myntra", "shopping")),
    ("Utilities", ("electricity", "broadband", "internet", "recharge")),
]


def _regex_merchant_fallback(body_text: str) -> Optional[str]:
    match = _SENDER_NAME_RE.search(body_text)
    if match:
        return match.group(1).strip().title()
    return None

MODEL = "openai/gpt-oss-20b"


def _build_system_prompt(categories: list[str]) -> str:
    """
    categories comes from the live CategoryOption table (see categories.py),
    not a fixed enum — so a category a user adds from the UI is available
    to the model on the very next sync, no code change or restart needed.
    """
    category_list = ", ".join(categories)
    return f"""You classify emails for a personal expense tracker.

Given an email's subject, sender, and body, decide whether it is a \
transaction notification: a bank debit/credit alert, a UPI/PhonePe/card \
payment receipt, an order confirmation, or a subscription charge. \
Newsletters, marketing, OTPs, delivery updates with no charge, and \
statements/summaries (not a single transaction) are NOT transactions.

If it is a transaction, extract:
- merchant: the OTHER party in the transaction, as a short human-readable \
  name — not the raw email/UPI address. For a Debit, this is who you paid \
  (e.g. "Swiggy", "Amazon", "Uber"). For a Credit, this is who paid YOU — \
  use the sender's name from the email (e.g. a line like "Sender: NELATURU \
  AVINASH" or "received from Jane Doe" means merchant is "Nelaturu \
  Avinash"). Always fill this in when a name is present anywhere in the \
  email, even if the wording doesn't literally say "merchant" or "payee".
- amount: the transaction amount as a plain number, in the currency's \
  major unit (e.g. rupees, not paise). Use the amount actually charged, \
  not any account balance mentioned.
- category: exactly one of: {category_list}. Never invent a category \
  outside this list — if nothing fits exactly (e.g. a bus/metro fare), use \
  "Other" rather than a more specific word like "Transportation".
- type: exactly one of "Debit" or "Credit". Debit means money left the \
  account (a purchase, bill payment, or transfer out). Credit means money \
  came into the account (a refund, cashback, salary deposit, or transfer \
  in). Look for explicit wording like "debited"/"credited", "spent"/ \
  "received", or "-"/"+" signs — don't assume every email is a debit.
- is_business: true only if this is clearly a work/business expense or \
  business income (e.g. cloud infrastructure, SaaS subscriptions for work, \
  business travel, a client payment received) rather than a personal one.

If it is not a transaction, or you cannot confidently determine the \
merchant, amount, and type, set is_transaction to false and leave the \
other fields empty (null).

Respond with ONLY a JSON object, no other text, matching exactly this \
shape:
{{
  "is_transaction": true or false,
  "merchant": string or null,
  "amount": number or null,
  "category": one of [{category_list}] or null,
  "type": "Debit" or "Credit" or null,
  "is_business": true or false
}}"""


class ExtractedExpense(BaseModel):
    is_transaction: bool
    merchant: Optional[str] = None
    amount: Optional[float] = None
    category: Optional[str] = None
    type: Optional[TransactionType] = None
    is_business: bool = False


def looks_like_hdfc_transaction(sender: str, body_text: str) -> bool:
    """Whether a failed rule parse represents likely template drift."""
    body = " ".join(body_text.split())
    return "hdfcbank" in sender.lower() and bool(_HDFC_AMOUNT_ACTION_RE.search(body))


def _category_for_merchant(merchant: str, categories: list[str]) -> tuple[str, bool]:
    merchant_lower = merchant.lower()
    for category, keywords in _CATEGORY_KEYWORDS:
        if any(keyword in merchant_lower for keyword in keywords):
            return (category if category in categories else "Other", category == "Business")
    return ("Other" if "Other" in categories else categories[-1], False)


def try_extract_hdfc(
    sender: str, body_text: str, categories: list[str]
) -> Optional[ExtractedExpense]:
    """Parse a known HDFC transaction template, or return None safely.

    Acceptance is intentionally strict. A changed or ambiguous template
    falls through to the AI extractor instead of risking a wrong ledger
    entry.
    """
    if "hdfcbank" not in sender.lower():
        return None

    body = " ".join(body_text.split())
    action_matches = list(_HDFC_AMOUNT_ACTION_RE.finditer(body))
    if len(action_matches) != 1:
        return None

    action_match = action_matches[0]
    try:
        amount = float(action_match.group(1).replace(",", ""))
    except ValueError:
        return None
    if not 0 < amount <= 100_000_000:
        return None

    transaction_type = (
        TransactionType.DEBIT if action_match.group(2).lower() == "debited" else TransactionType.CREDIT
    )
    merchant_match = _HDFC_VPA_NAME_RE.search(body)
    if merchant_match is None and transaction_type == TransactionType.CREDIT:
        merchant_match = _SENDER_NAME_RE.search(body) or _HDFC_RECEIVED_FROM_RE.search(body)
    if merchant_match is None:
        return None

    merchant = re.sub(r"\s+", " ", merchant_match.group(1)).strip(" .,-").title()
    if not 2 <= len(merchant) <= 80 or not any(character.isalpha() for character in merchant):
        return None

    category, is_business = _category_for_merchant(merchant, categories)
    return ExtractedExpense(
        is_transaction=True,
        merchant=merchant,
        amount=amount,
        category=category,
        type=transaction_type,
        is_business=is_business,
    )


def _call_model(client: OpenAI, subject: str, sender: str, body_text: str, categories: list[str]) -> ExtractedExpense:
    messages = [
        {"role": "system", "content": _build_system_prompt(categories)},
        {"role": "user", "content": f"Subject: {subject}\nFrom: {sender}\n\n{body_text}"},
    ]
    if os.getenv("MAIL_SYNC_DEBUG") == "1":
        print("=== LLM REQUEST ===\n", json.dumps(messages, indent=2))
    response = client.chat.completions.create(
        model=MODEL,
        messages=messages,
        response_format={"type": "json_object"},
        temperature=0,
        # gpt-oss-20b is a reasoning model — this deployment counts its
        # internal chain-of-thought tokens against max_tokens, so a small
        # budget starves the actual JSON answer before it's ever written
        # (confirmed in practice: most calls came back empty or with the
        # JSON truncated mid-field at 300). 2000 leaves enough room for
        # reasoning on top of the tiny JSON payload actually needed.
        max_tokens=2000,
    )
    raw = response.choices[0].message.content
    if os.getenv("MAIL_SYNC_DEBUG") == "1":
        print("=== LLM RESPONSE ===\n", raw)
    if not raw:
        raise ValueError("NVIDIA model returned no content")

    try:
        data = json.loads(raw)
    except json.JSONDecodeError as exc:
        raise ValueError(f"NVIDIA model returned non-JSON output: {raw!r}") from exc

    # Unlike Gemini's response_schema, NIM doesn't constrain output to valid
    # enum values — it sometimes invents a category outside our list (e.g.
    # "Transportation" instead of "Travel"). Falling back to None rather
    # than letting the whole extraction fail on that one field: a real
    # transaction with the wrong category default (agent.py falls back to
    # "Other") is far better than silently dropping a correctly-extracted
    # merchant/amount/type over one bad enum value.
    if data.get("category") not in categories:
        data["category"] = None
    if data.get("type") not in {t.value for t in TransactionType}:
        data["type"] = None

    try:
        return ExtractedExpense.model_validate(data)
    except ValidationError as exc:
        raise ValueError(f"NVIDIA model returned unexpected shape: {raw!r}") from exc


def extract_expense(
    client: OpenAI, subject: str, sender: str, body_text: str, categories: list[str]
) -> ExtractedExpense:
    result = _call_model(client, subject, sender, body_text, categories)

    # merchant extraction is confirmed non-deterministic on this model even
    # at temperature 0 — the same input sometimes returns the name, other
    # times None. Try a free, instant regex match against the recurring
    # "Sender: NAME (" bank-template pattern before spending a second call.
    if result.is_transaction and not result.merchant:
        regex_merchant = _regex_merchant_fallback(body_text)
        if regex_merchant:
            result = result.model_copy(update={"merchant": regex_merchant})

    # Still nothing (a format the regex doesn't cover) — one retry catches
    # most of the remaining non-determinism at negligible extra cost.
    if result.is_transaction and not result.merchant:
        retry = _call_model(client, subject, sender, body_text, categories)
        if retry.merchant:
            result = result.model_copy(update={"merchant": retry.merchant})

    return result


def extract_expense_hybrid(
    client: OpenAI, subject: str, sender: str, body_text: str, categories: list[str]
) -> tuple[ExtractedExpense, str]:
    """Use deterministic bank parsing first, then AI as the safety net.

    The source string is returned for sync observability. `ai_template_drift`
    means an HDFC transaction-shaped email no longer matched the strict
    parser and should become a regression fixture if the AI handles it.
    """
    parsed = try_extract_hdfc(sender, body_text, categories)
    if parsed is not None:
        return parsed, "rules"
    source = "ai_template_drift" if looks_like_hdfc_transaction(sender, body_text) else "ai"
    return extract_expense(client, subject, sender, body_text, categories), source
