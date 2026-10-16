import { API_BASE_URL } from './constants';
import { AppSettings, AuthUser, BankAccount, GmailStatus, MailSyncResult, ManualExpenseInput, PersonalSpendByDay, Transaction } from './types';

export class ApiError extends Error {}

async function authRequest(path: string, init?: RequestInit): Promise<AuthUser> {
  const res = await fetch(`${API_BASE_URL}/auth/${path}`, {
    credentials: 'include',
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new ApiError(detailMessage(body, `Authentication failed (${res.status})`));
  }
  return res.json();
}

export async function fetchCurrentUser(): Promise<AuthUser | null> {
  const res = await fetch(`${API_BASE_URL}/auth/me`, { credentials: 'include' });
  if (res.status === 401) return null;
  if (!res.ok) throw new ApiError(`Could not check your session (${res.status})`);
  return res.json();
}

export function registerUser(email: string, password: string): Promise<AuthUser> {
  return authRequest('register', { method: 'POST', body: JSON.stringify({ email, password }) });
}

export function loginUser(email: string, password: string): Promise<AuthUser> {
  return authRequest('login', { method: 'POST', body: JSON.stringify({ email, password }) });
}

export async function logoutUser(): Promise<void> {
  const res = await fetch(`${API_BASE_URL}/auth/logout`, { method: 'POST', credentials: 'include' });
  if (!res.ok && res.status !== 401) throw new ApiError(`Could not sign out (${res.status})`);
}

export async function fetchGmailStatus(): Promise<GmailStatus> {
  const res = await fetch(`${API_BASE_URL}/gmail/status`, { credentials: 'include' });
  if (!res.ok) throw new ApiError(`Could not check Gmail (${res.status})`);
  return res.json();
}

export async function beginGmailConnection(): Promise<void> {
  const res = await fetch(`${API_BASE_URL}/gmail/connect`, { method: 'POST', credentials: 'include' });
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new ApiError(detailMessage(body, `Could not connect Gmail (${res.status})`));
  }
  const body: { authorizationUrl: string } = await res.json();
  window.location.assign(body.authorizationUrl);
}

export async function disconnectGmail(): Promise<void> {
  const res = await fetch(`${API_BASE_URL}/gmail/connection`, { method: 'DELETE', credentials: 'include' });
  if (!res.ok) throw new ApiError(`Could not disconnect Gmail (${res.status})`);
}

/**
 * FastAPI's `detail` is usually a plain string, but on a 422 validation
 * error it's an array of `{loc, msg, type}` objects instead — passed
 * straight into `new Error(...)`, that stringifies to an unreadable
 * "[object Object],[object Object]". This pulls out just the human `msg`
 * text (joined, if there's more than one) so the toast stays readable.
 */
function detailMessage(body: unknown, fallback: string): string {
  const detail = (body as { detail?: unknown } | null)?.detail;
  if (typeof detail === 'string') return detail;
  if (Array.isArray(detail)) {
    const messages = detail
      .map((item) => (item && typeof item === 'object' && 'msg' in item ? String((item as { msg: unknown }).msg) : null))
      .filter((m): m is string => !!m);
    if (messages.length > 0) return messages.join('; ');
  }
  return fallback;
}

/**
 * GET /api/expenses
 */
export async function fetchExpenses(signal?: AbortSignal): Promise<Transaction[]> {
  const res = await fetch(`${API_BASE_URL}/expenses`, { signal });
  if (!res.ok) {
    throw new ApiError(`Failed to load transactions (${res.status})`);
  }
  return res.json();
}

/**
 * GET /api/expenses/personal-by-day
 * Every Personal-pool debit, grouped by calendar day — same scope as the
 * dashboard's Personal Spend card (since each account's anchoredAt).
 * Pass accountId to match a single-account dashboard filter; omit it to
 * combine every non-archived account, matching "All accounts (combined)".
 */
export async function fetchPersonalSpendByDay(accountId?: string): Promise<PersonalSpendByDay> {
  const query = accountId ? `?accountId=${encodeURIComponent(accountId)}` : '';
  const res = await fetch(`${API_BASE_URL}/expenses/personal-by-day${query}`);
  if (!res.ok) {
    throw new ApiError(`Failed to load spend by day (${res.status})`);
  }
  return res.json();
}

/**
 * PUT /api/expenses/day-notes/:date
 * Sets or clears the free-text note attached to a calendar day (not any
 * one account) — send an empty/whitespace-only note to clear it.
 */
export async function updateDayNote(date: string, note: string): Promise<{ date: string; note: string | null }> {
  const res = await fetch(`${API_BASE_URL}/expenses/day-notes/${date}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ note }),
  });
  if (!res.ok) {
    throw new ApiError(detailMessage(await res.json().catch(() => null), `Failed to save that note (${res.status})`));
  }
  return res.json();
}

/**
 * POST /api/expenses/manual
 */
export async function createManualExpense(input: ManualExpenseInput): Promise<Transaction> {
  const res = await fetch(`${API_BASE_URL}/expenses/manual`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  if (!res.ok) {
    throw new ApiError(`Failed to save expense (${res.status})`);
  }
  return res.json();
}

/**
 * PATCH /api/expenses/:id
 * Used for pool-tag changes, external split-share updates, internal
 * pool-allocation updates, adding/clearing a note on one transaction
 * (send note: '' to clear it), and setting/clearing an effectiveDate
 * override — which day its spend counts toward (send effectiveDate: ''
 * to clear it back to the transaction's own date). The real `date` is
 * never editable here.
 */
export async function updateExpense(
  id: string,
  patch: Partial<
    Pick<
      Transaction,
      | 'category'
      | 'type'
      | 'pool'
      | 'isSplit'
      | 'shareAmount'
      | 'isAllocated'
      | 'allocationPool'
      | 'allocationAmount'
      | 'note'
      | 'effectiveDate'
    >
  >
): Promise<Transaction> {
  const res = await fetch(`${API_BASE_URL}/expenses/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(patch),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new ApiError(detailMessage(body, `Failed to update expense (${res.status})`));
  }
  return res.json();
}

/**
 * GET /api/bank-accounts
 * Every bank account being tracked, including the built-in Cash one.
 */
export async function fetchBankAccounts(): Promise<BankAccount[]> {
  const res = await fetch(`${API_BASE_URL}/bank-accounts`);
  if (!res.ok) {
    throw new ApiError(`Failed to load bank accounts (${res.status})`);
  }
  return res.json();
}

/** One pool in an add/update bank-account payload — see PoolInput in the backend's schemas.py. */
export type PoolInput = {
  name: string;
  startingAmount: number;
  isAuto: boolean;
};

export type BankAccountInput = {
  bank: string;
  /** The full desired set of Gmail sender addresses for this account — replaces whatever was there before, same as pools. */
  emailAddresses: string[];
  balance: number;
  minBalance: number;
  /** The full desired set of pools for this account — replaces whatever pools it had before. See BankAccountInput in the backend's schemas.py. */
  pools: PoolInput[];
};

/**
 * POST /api/bank-accounts
 */
export async function addBankAccount(input: BankAccountInput): Promise<BankAccount> {
  const res = await fetch(`${API_BASE_URL}/bank-accounts`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new ApiError(detailMessage(body, `Failed to add bank account (${res.status})`));
  }
  return res.json();
}

/**
 * PUT /api/bank-accounts/:id
 * Re-anchors this account's balance tracking to now, same as the old
 * single-account setup — see BankAccount in types.ts.
 */
export async function updateBankAccount(id: string, input: BankAccountInput): Promise<BankAccount> {
  const res = await fetch(`${API_BASE_URL}/bank-accounts/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new ApiError(detailMessage(body, `Failed to save bank account (${res.status})`));
  }
  return res.json();
}

/**
 * POST /api/bank-accounts/:id/emails
 * Adds one Gmail sender address to an account without needing its full
 * current setup (unlike updateBankAccount, which replaces the whole
 * thing) — used by the "report a missing transaction" flow, where the fix
 * is usually "mail sync never had this sender configured." A no-op if the
 * address is already there.
 */
export async function addBankAccountEmail(id: string, address: string): Promise<BankAccount> {
  const res = await fetch(`${API_BASE_URL}/bank-accounts/${id}/emails`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ address }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new ApiError(detailMessage(body, `Failed to add sender address (${res.status})`));
  }
  return res.json();
}

/**
 * POST /api/bank-accounts/:id/pools/transfer
 * Moves `amount` from one of the account's pools to another — a relabeling
 * of money already in the account (shifts both pools' startingAmount),
 * not a real debit/credit, so the account's live total is unaffected.
 */
export async function transferBetweenPools(
  accountId: string,
  fromPool: string,
  toPool: string,
  amount: number
): Promise<BankAccount> {
  const res = await fetch(`${API_BASE_URL}/bank-accounts/${accountId}/pools/transfer`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ fromPool, toPool, amount }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new ApiError(detailMessage(body, `Failed to transfer between pools (${res.status})`));
  }
  return res.json();
}

export type ManagedPoolInput = { name: string; amount: number };

/**
 * PUT /api/bank-accounts/:id/pools
 * Applies a complete live allocation by recording internal pool-transfer
 * events. It does not re-anchor the account or alter any transaction.
 */
export async function manageAccountPools(accountId: string, pools: ManagedPoolInput[]): Promise<BankAccount> {
  const res = await fetch(`${API_BASE_URL}/bank-accounts/${accountId}/pools`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ pools }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new ApiError(detailMessage(body, `Failed to update pools (${res.status})`));
  }
  return res.json();
}

/**
 * DELETE /api/bank-accounts/:id
 * The built-in Cash account can't be deleted (the backend rejects
 * it); any transaction on a deleted account is reassigned to Cash.
 */
export async function deleteBankAccount(id: string): Promise<void> {
  const res = await fetch(`${API_BASE_URL}/bank-accounts/${id}`, { method: 'DELETE' });
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new ApiError(detailMessage(body, `Failed to remove bank account (${res.status})`));
  }
}

/**
 * GET /api/settings
 */
export async function fetchAppSettings(): Promise<AppSettings> {
  const res = await fetch(`${API_BASE_URL}/settings`);
  if (!res.ok) {
    throw new ApiError(`Failed to load settings (${res.status})`);
  }
  return res.json();
}

/**
 * PATCH /api/settings/monthly-budget
 * Shared across every bank account — never touches any account's
 * anchoredAt or balance/pool fields.
 */
export async function updateMonthlyBudget(monthlyBudget: number): Promise<AppSettings> {
  const res = await fetch(`${API_BASE_URL}/settings/monthly-budget`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ monthlyBudget }),
  });
  if (!res.ok) {
    throw new ApiError(`Failed to save monthly budget (${res.status})`);
  }
  return res.json();
}

/**
 * GET /api/categories
 * Every category name available in the pickers and the mail-sync prompt.
 */
export async function fetchCategories(): Promise<string[]> {
  const res = await fetch(`${API_BASE_URL}/categories`);
  if (!res.ok) {
    throw new ApiError(`Failed to load categories (${res.status})`);
  }
  return res.json();
}

/**
 * POST /api/categories
 * Registers a new category name (a no-op if it already exists).
 */
export async function addCategory(name: string): Promise<string> {
  const res = await fetch(`${API_BASE_URL}/categories`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name }),
  });
  if (!res.ok) {
    throw new ApiError(`Failed to add category (${res.status})`);
  }
  return res.json();
}

/**
 * PATCH /api/categories/:name
 * Renames a category — every transaction using it moves to the new name.
 * Renaming onto an existing name merges the two.
 */
export async function renameCategory(name: string, newName: string): Promise<string> {
  const res = await fetch(`${API_BASE_URL}/categories/${encodeURIComponent(name)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: newName }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new ApiError(detailMessage(body, `Failed to rename category (${res.status})`));
  }
  return res.json();
}

/**
 * DELETE /api/categories/:name
 * The built-in "Other" category can't be deleted; any transaction using
 * the removed category is reassigned to it.
 */
export async function deleteCategory(name: string): Promise<void> {
  const res = await fetch(`${API_BASE_URL}/categories/${encodeURIComponent(name)}`, { method: 'DELETE' });
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new ApiError(detailMessage(body, `Failed to delete category (${res.status})`));
  }
}

/**
 * POST /api/agent/sync-mail
 * Triggers the mail-reading agent: scans recent email across every
 * configured bank account's sender address, has the model classify and
 * extract each candidate transaction, and inserts any real matches.
 */
export async function syncMail(): Promise<MailSyncResult> {
  const res = await fetch(`${API_BASE_URL}/agent/sync-mail`, { method: 'POST' });
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new ApiError(detailMessage(body, `Mail sync failed (${res.status})`));
  }
  return res.json();
}
