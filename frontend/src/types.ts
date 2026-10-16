/**
 * Category is a free-typed string, not a fixed set — the backend's
 * CategoryOption table is the source of truth (see GET/POST
 * /api/categories in api.ts), so users can add their own from the UI and
 * the mail-sync agent picks them up on the next sync.
 */
export type Category = string;

export interface AuthUser {
  id: string;
  email: string;
  gmailConnected: boolean;
}

export interface GmailStatus {
  connected: boolean;
  email: string | null;
}

export type Source = 'SMS' | 'Cash' | 'PhonePe' | 'Email';

/** Debit = money leaving the account. Credit = money coming in (refund, cashback, salary, transfer in). */
export type TransactionType = 'Debit' | 'Credit';

/**
 * The permanent, un-deletable pool every account has — anything not
 * explicitly tagged to another pool lands here, and it's what a removed
 * pool's transactions fall back to. Every other pool (Business, Savings,
 * or anything else) is entirely user-defined per account — see
 * AccountPool.
 */
export const DEFAULT_POOL_NAME = 'Personal';

export interface Transaction {
  id: string;
  /** Which BankAccount this transaction belongs to — see BankAccount. */
  accountId: string;
  merchant: string;
  category: Category;
  /** Full amount of the transaction. */
  amount: number;
  /** When isSplit is true, this is the portion attributable to the user. */
  shareAmount?: number;
  date: string; // ISO 8601
  source: Source;
  type: TransactionType;
  /** Which of the account's pools this counts toward — see BankAccount.pools and computePools. Free-typed, not a fixed set. */
  pool: string;
  isSplit: boolean;
  /**
   * Internal split — of MY money, how much belongs in a different pool
   * than the primary one (`pool`)? E.g. a lump-sum deposit that's mostly
   * Savings with a Personal carve-out. Independent of isSplit/shareAmount
   * (external split — how much of a shared expense is mine vs. someone
   * else's); both can apply to the same transaction. allocationPool gets
   * exactly allocationAmount; `pool` gets the remainder. Based on the
   * full amount, not shareAmount.
   */
  isAllocated: boolean;
  allocationPool?: string;
  allocationAmount?: number;
  /** A free-text note on this one transaction — shown/edited from the Personal Spend by day page. */
  note?: string;
  /**
   * YYYY-MM-DD override for which calendar day this transaction's spend
   * counts toward on the Personal Spend by day page and "Today's Spend"
   * — e.g. money spent yesterday but only paid back/logged today. `date`
   * itself (the real transaction timestamp, used for balance/ordering/
   * anchoredAt scoping) is never touched by this — see effectiveSpendDay.
   */
  effectiveDate?: string;
}

/**
 * One "bucket" of a BankAccount's balance — Personal (the permanent
 * default every account has), Business, Savings, or anything else the
 * user names. startingAmount is this pool's share of the account's
 * balance as of anchoredAt; from there it moves with every transaction
 * tagged to it (see computePools).
 *
 * isAuto marks the one pool (at most) whose startingAmount was left blank
 * in the setup form and computed as "whatever's left" of the balance,
 * rather than typed in directly — see AccountFieldsForm in
 * BankAccountsManager.tsx. isDefault marks the permanent Personal pool,
 * which can't be renamed or deleted.
 */
export interface AccountPool {
  id: string;
  name: string;
  startingAmount: number;
  isAuto: boolean;
  isDefault: boolean;
  createdAt?: string;
  archivedAt?: string;
}

export interface PoolAllocationEvent {
  id: string;
  fromPool: string;
  toPool: string;
  amount: number;
  createdAt: string;
}

/**
 * One bank account being tracked — a starting balance and a minimum-
 * balance buffer that's reserved, never tagged to any pool. Everything
 * else (Personal, Business, Savings, or any custom split) lives in
 * `pools`, entirely user-configured per account. Later pool changes are
 * stored as timestamped allocation events rather than rewriting the
 * starting state, so historical account snapshots remain reproducible.
 * Transactions dated before `anchoredAt` don't count toward this account's
 * live balance/pools because the initial balance already reflects them.
 *
 * emailAddresses is every Gmail sender the mail-sync agent scans for this
 * account — a bank often alerts from more than one address, so this is a
 * list, not a single value; empty for the built-in Cash account
 * (isDefault), which catches manual entries and anything that doesn't
 * match a configured sender. Multiple accounts are supported — see
 * combinePools for how the dashboard sums them into one combined view, or
 * filters to just one.
 *
 * isArchive marks the other built-in account, "Deleted Accounts" — where
 * a real account's transactions land when that account is removed. It
 * has no anchoredAt, so it never contributes to any pool total or the
 * combined balance (see combinePools/computePools); it's still viewable
 * on the Transactions page and selectable on its own via the account
 * filter, just excluded from the default combined view so a deleted
 * account's old history never mixes into genuine Cash entries.
 */
export interface BankAccount {
  id: string;
  bank: string;
  emailAddresses: string[];
  isDefault: boolean;
  isArchive: boolean;
  balance: number;
  minBalance: number;
  anchoredAt: string | null;
  pools: AccountPool[];
  /** Every pool ever used by this account, including archived pools, for historical reconstruction. */
  poolHistory?: AccountPool[];
  /** Internal pool-to-pool movements; they never change the bank balance. */
  allocationEvents?: PoolAllocationEvent[];
}

/** App-wide settings not tied to any one bank account. */
export interface AppSettings {
  /** Threshold the dashboard's Monthly Budget card measures personal spend against, shared across every account. */
  monthlyBudget: number;
}

export type ManualExpenseInput = {
  merchant: string;
  amount: number;
  category: Category;
  isCashEntry: boolean;
  /** Which of the target account's pools this counts toward — "Personal" (the default) unless the account has others and one is picked. */
  pool: string;
  type: TransactionType;
  /** Omit to fall back to the built-in Cash account. */
  accountId?: string;
};

/** One calendar day's worth of Personal-pool spend — see GET /api/expenses/personal-by-day. */
export type PersonalSpendDay = {
  date: string; // YYYY-MM-DD
  total: number;
  /** A free-text note attached to this calendar day (not any one account) — see PUT /api/expenses/day-notes/:date. */
  note?: string;
  transactions: Transaction[];
};

/** Response from GET /api/expenses/personal-by-day. Days sorted newest first, each with its own transactions the same way. */
export type PersonalSpendByDay = {
  total: number;
  days: PersonalSpendDay[];
};

/** Response from POST /api/agent/sync-mail. */
export type MailSyncResult = {
  /** The Gmail search query actually used for this sync — built from every BankAccount with an emailAddress. */
  query: string;
  scanned: number;
  already_processed: number;
  /** Unseen messages left in the current Gmail search window for a later sync. */
  deferred: number;
  added: number;
  skipped: number;
  /** Messages handled without an external AI call. */
  rule_parsed?: number;
  /** Messages that required the AI fallback. */
  ai_classified?: number;
  /** HDFC transaction-shaped messages that no longer matched the strict template parser. */
  template_drift?: number;
  errors: string[];
};

/** Amount that actually counts against the user's own spending. */
export function effectiveAmount(tx: Transaction): number {
  if (tx.isSplit && typeof tx.shareAmount === 'number') return tx.shareAmount;
  return tx.amount;
}

/** Local YYYY-MM-DD for an ISO timestamp — the calendar day a user actually perceives it as, not necessarily the UTC day the string encodes. */
export function localDayKey(iso: string): string {
  const d = new Date(iso);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * Which calendar day (YYYY-MM-DD) this transaction's spend actually counts
 * toward: its own effectiveDate override if set (see PATCH
 * /api/expenses/:id), otherwise the local day of its real `date`. Used by
 * "Today's Spend" so a backdated entry (spent yesterday, logged today)
 * lands in the right bucket without touching the real transaction
 * timestamp used for balance/ordering/anchoring.
 */
export function effectiveSpendDay(tx: Transaction): string {
  return tx.effectiveDate || localDayKey(tx.date);
}

/**
 * Transactions whose effective spend day falls in the local calendar
 * month containing `date`. Budget widgets use this instead of the full
 * post-anchor history so a new month starts from zero without changing
 * balances or hiding older transactions.
 */
export function transactionsInMonth(
  transactions: Transaction[],
  date: Date = new Date()
): Transaction[] {
  const monthKey = localDayKey(date.toISOString()).slice(0, 7);
  return transactions.filter((tx) => effectiveSpendDay(tx).startsWith(monthKey));
}

/**
 * Personal-pool spend across the given transactions — same scope as the
 * dashboard's Personal Spend card: excludes credits (income isn't spend)
 * and every other pool (Business, Savings, or a custom split). Used by
 * both SummaryCards and the sidebar's Monthly Budget widget so the two
 * numbers never drift apart.
 */
export function personalSpendTotal(transactions: Transaction[]): number {
  let total = 0;
  for (const tx of transactions) {
    if (tx.type === 'Credit') continue;
    if ((tx.pool || DEFAULT_POOL_NAME) !== DEFAULT_POOL_NAME) continue;
    total += effectiveAmount(tx);
  }
  return total;
}

/**
 * Transactions belonging to `account`, dated at/after its anchoredAt — the
 * only ones that count toward that account's live balance/pools, and (per
 * how the dashboard is wired in App.tsx) toward spend totals and
 * analytics. Older transactions still show in the transaction list for
 * reference — they're just excluded from anything that sums or budgets
 * against them, since the starting balance already reflects them.
 */
export function transactionsSinceAnchor(account: BankAccount, transactions: Transaction[]): Transaction[] {
  if (!account.anchoredAt) return [];
  const anchor = new Date(account.anchoredAt).getTime();
  return transactions.filter((t) => t.accountId === account.id && new Date(t.date).getTime() >= anchor);
}

/** Same as transactionsSinceAnchor, but across every account in the list — e.g. every configured account, or just the ones a dashboard filter selected. */
export function transactionsSinceAnchorForAccounts(accounts: BankAccount[], transactions: Transaction[]): Transaction[] {
  return accounts.flatMap((account) => transactionsSinceAnchor(account, transactions));
}

export interface Pools {
  /** Pool name -> its current live amount. Keys are whatever pools the account(s) actually have — Personal is always present, the rest vary. */
  byPool: Record<string, number>;
  /** The minimum-balance buffer — never tagged to any pool, always static. */
  reserved: number;
  total: number;
}

/** Pool names that were available on an account at a particular instant. */
export function poolNamesAt(account: BankAccount, asOf: string): string[] {
  const history = account.poolHistory;
  if (!history) return account.pools.map((pool) => pool.name);

  const asOfTime = new Date(asOf).getTime();
  return history
    .filter((pool) => {
      const existed = !pool.createdAt || new Date(pool.createdAt).getTime() <= asOfTime;
      const notYetArchived = !pool.archivedAt || new Date(pool.archivedAt).getTime() > asOfTime;
      return existed && notYetArchived;
    })
    .map((pool) => pool.name);
}

/**
 * Live balance split across an account's own pools, plus the reserved
 * minimum-balance buffer — always sums to the total:
 * - reserved: the minimum balance you must keep in the account — money you
 *   can't actually spend, so it's carved out rather than counted toward
 *   any pool. Static.
 * - each pool: its starting amount, then every credit/debit on a
 *   transaction tagged to it (`tx.pool`) adjusts it.
 * A transaction marked isAllocated splits across two pools instead of one:
 * allocationPool gets exactly allocationAmount, the primary pool (`pool`)
 * gets the rest — e.g. a ₹12,300 deposit tagged Savings with a ₹300
 * allocation to Personal lands ₹12,000 in Savings and ₹300 in Personal,
 * not the full ₹12,300 in one bucket.
 * Only transactions since `account.anchoredAt` count, and only ones
 * belonging to this account — anything before it, or on a different
 * account, is out of scope here (see combinePools for multi-account).
 * A transaction tagged to a pool the account no longer has (e.g. one
 * removed since) still gets its own entry here rather than being dropped,
 * so nothing silently vanishes from the total.
 */
export function computePools(account: BankAccount, transactions: Transaction[], asOf?: string): Pools {
  const byPool: Record<string, number> = {};
  const asOfTime = asOf ? new Date(asOf).getTime() : null;
  const poolHistory = account.poolHistory ?? account.pools;
  for (const pool of poolHistory) {
    if (asOfTime != null && pool.createdAt && new Date(pool.createdAt).getTime() > asOfTime) continue;
    byPool[pool.name] = pool.startingAmount;
  }

  for (const tx of transactionsSinceAnchor(account, transactions)) {
    if (asOfTime != null && new Date(tx.date).getTime() > asOfTime) continue;
    // Full amount, not effectiveAmount — a split's "share" is a personal-
    // budgeting concept (how much of a shared expense is "yours"), but the
    // full amount is what actually moved in the bank account. Re-splitting
    // a transaction must never move the real balance.
    const sign = tx.type === 'Credit' ? 1 : -1;
    const primaryPool = tx.pool || DEFAULT_POOL_NAME;
    if (!(primaryPool in byPool)) byPool[primaryPool] = 0;

    if (tx.isAllocated && tx.allocationPool && typeof tx.allocationAmount === 'number') {
      if (!(tx.allocationPool in byPool)) byPool[tx.allocationPool] = 0;
      byPool[tx.allocationPool] += sign * tx.allocationAmount;
      byPool[primaryPool] += sign * (tx.amount - tx.allocationAmount);
    } else {
      byPool[primaryPool] += sign * tx.amount;
    }
  }

  for (const event of account.allocationEvents ?? []) {
    const eventTime = new Date(event.createdAt).getTime();
    if (account.anchoredAt && eventTime < new Date(account.anchoredAt).getTime()) continue;
    if (asOfTime != null && eventTime > asOfTime) continue;
    if (!(event.fromPool in byPool)) byPool[event.fromPool] = 0;
    if (!(event.toPool in byPool)) byPool[event.toPool] = 0;
    byPool[event.fromPool] -= event.amount;
    byPool[event.toPool] += event.amount;
  }

  for (const pool of poolHistory) {
    if (!pool.archivedAt) continue;
    if (asOfTime == null || new Date(pool.archivedAt).getTime() <= asOfTime) delete byPool[pool.name];
  }

  const reserved = account.minBalance;
  const total = reserved + Object.values(byPool).reduce((sum, v) => sum + v, 0);
  return { byPool, reserved, total };
}

/**
 * Reconstructs one account immediately after a particular transaction.
 * Uses the same anchored starting balance and pool-allocation rules as the
 * live account card, but stops the chronological ledger at `transactionId`.
 * Returns null when the transaction predates the account's current anchor,
 * because the app has no reliable starting state for that older history.
 */
export function computeAccountSnapshotAfter(
  account: BankAccount,
  transactions: Transaction[],
  transactionId: string
): Pools | null {
  const chronological = transactionsSinceAnchor(account, transactions)
    .slice()
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  const selectedIndex = chronological.findIndex((tx) => tx.id === transactionId);
  if (selectedIndex < 0) return null;
  return computePools(account, chronological.slice(0, selectedIndex + 1), chronological[selectedIndex].date);
}

/**
 * Sums computePools across every account passed in — matching pool names
 * (e.g. "Personal" on two different accounts) are added together, and a
 * pool that only exists on one account still gets its own entry. Pass
 * every configured account for the true combined total, or a one-account
 * array to view just that account.
 */
export function combinePools(accounts: BankAccount[], transactions: Transaction[]): Pools {
  const byPool: Record<string, number> = {};
  let reserved = 0;
  for (const account of accounts) {
    // An account without an anchor is not live yet. Its seed pool template
    // must not leak old/default pool names into the combined dashboard.
    if (!account.anchoredAt) continue;
    const p = computePools(account, transactions);
    reserved += p.reserved;
    for (const [name, amount] of Object.entries(p.byPool)) {
      byPool[name] = (byPool[name] ?? 0) + amount;
    }
  }
  const total = reserved + Object.values(byPool).reduce((sum, v) => sum + v, 0);
  return { byPool, reserved, total };
}

/** Live total balance across the given accounts — see combinePools. */
export function combineLiveBalance(accounts: BankAccount[], transactions: Transaction[]): number {
  return combinePools(accounts, transactions).total;
}

/**
 * Each account's own running balance after every one of its transactions,
 * in chronological order — a flat, per-account bank-balance number (full
 * amount, not effectiveAmount or pool-split, same reasoning as
 * computePools: the full amount is what actually moved). Used for the
 * Transactions table's "Balance" column. Transactions before an account's
 * anchoredAt (or on an account with none set) have no entry — there's no
 * running balance to show for them, since they're outside live tracking.
 */
export function computeRunningBalances(accounts: BankAccount[], transactions: Transaction[]): Record<string, number> {
  const result: Record<string, number> = {};
  for (const account of accounts) {
    const chronological = transactionsSinceAnchor(account, transactions)
      .slice()
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    let running = account.balance;
    for (const tx of chronological) {
      running += tx.type === 'Credit' ? tx.amount : -tx.amount;
      result[tx.id] = running;
    }
  }
  return result;
}
