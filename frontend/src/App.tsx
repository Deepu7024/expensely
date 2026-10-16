import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Menu } from 'lucide-react';
import Sidebar, { View } from './components/Sidebar';
import QuickActions from './components/QuickActions';
import SummaryCards from './components/SummaryCards';
import TransactionsTable from './components/TransactionsTable';
import SplitModal from './components/SplitModal';
import AllocateModal from './components/AllocateModal';
import ManualEntryModal from './components/ManualEntryModal';
import ManualEntryForm from './components/ManualEntryForm';
import Analytics from './components/Analytics';
import BankAccountsManager from './components/BankAccountsManager';
import CategoriesManager from './components/CategoriesManager';
import PersonalSpendPage from './components/PersonalSpendPage';
import AccountOverviewCard from './components/AccountOverviewCard';
import AccountSnapshotModal from './components/AccountSnapshotModal';
import AuthScreen from './components/AuthScreen';
import GmailConnectionCard from './components/GmailConnectionCard';
import ErrorBanner from './components/ErrorBanner';
import ToastStack, { ToastMessage } from './components/Toast';
import {
  addBankAccount,
  addBankAccountEmail,
  addCategory,
  BankAccountInput,
  createManualExpense,
  deleteBankAccount,
  deleteCategory,
  fetchAppSettings,
  fetchBankAccounts,
  fetchCategories,
  fetchExpenses,
  fetchCurrentUser,
  logoutUser,
  manageAccountPools,
  renameCategory,
  syncMail,
  transferBetweenPools,
  updateBankAccount,
  updateExpense,
  updateMonthlyBudget,
} from './api';
import {
  AppSettings,
  AuthUser,
  BankAccount,
  DEFAULT_POOL_NAME,
  ManualExpenseInput,
  Transaction,
  combineLiveBalance,
  personalSpendTotal,
  transactionsInMonth,
  transactionsSinceAnchorForAccounts,
} from './types';
import { MONTHLY_BUDGET_DEFAULT, SEED_TRANSACTIONS } from './constants';
import { formatCurrency } from './utils/format';

let toastId = 0;

const VIEW_TITLES: Record<View, { title: string; subtitle: string }> = {
  dashboard: { title: 'Dashboard', subtitle: 'Your spending at a glance' },
  transactions: { title: 'Transactions', subtitle: 'Every expense, synced and searchable' },
  manual: { title: 'Manual Entry', subtitle: 'Log a cash expense by hand' },
  analytics: { title: 'Analytics', subtitle: 'Where your money actually goes' },
  account: { title: 'Accounts', subtitle: 'Every bank account you track, balance & mail sync setup' },
  categories: { title: 'Categories', subtitle: 'Rename or remove the categories you use' },
  personalSpend: { title: 'Personal Spend', subtitle: 'Every personal-pool expense, grouped by day' },
};

const ALL_ACCOUNTS = 'all';

export default function App() {
  const [user, setUser] = useState<AuthUser | null | undefined>(undefined);
  const [isNewUser, setIsNewUser] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  useEffect(() => {
    fetchCurrentUser()
      .then(setUser)
      .catch((err) => {
        setAuthError(err instanceof Error ? err.message : 'Could not reach the server.');
        setUser(null);
      });
  }, []);

  if (user === undefined) {
    return (
      <div className="flex min-h-[100dvh] items-center justify-center bg-zinc-950 text-sm text-zinc-500">
        Opening Expensely…
      </div>
    );
  }

  if (user === null) {
    return (
      <AuthScreen
        startupError={authError}
        onAuthenticated={(authenticatedUser, registered) => {
          setAuthError(null);
          setIsNewUser(registered);
          setUser(authenticatedUser);
        }}
      />
    );
  }

  return (
    <LedgerApp
      user={user}
      isNewUser={isNewUser}
      onLogout={async () => {
        try { await logoutUser(); } finally { setUser(null); setIsNewUser(false); }
      }}
    />
  );
}

interface LedgerAppProps {
  user: AuthUser;
  isNewUser: boolean;
  onLogout: () => Promise<void>;
}

function LedgerApp({ user, isNewUser, onLogout }: LedgerAppProps) {
  const [view, setView] = useState<View>(isNewUser ? 'account' : 'dashboard');
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    if (!sidebarOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [sidebarOpen]);

  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [usingDemoData, setUsingDemoData] = useState(false);

  const [bankAccounts, setBankAccounts] = useState<BankAccount[]>([]);
  const [accountsLoading, setAccountsLoading] = useState(true);
  const [savingAccount, setSavingAccount] = useState(false);
  const [deletingAccountId, setDeletingAccountId] = useState<string | null>(null);
  const [savingEmail, setSavingEmail] = useState(false);
  const [transferringPool, setTransferringPool] = useState(false);
  const [accountFilter, setAccountFilter] = useState<string>(ALL_ACCOUNTS);

  const [appSettings, setAppSettings] = useState<AppSettings | null>(null);

  const [categories, setCategories] = useState<string[]>([]);
  const [savingCategory, setSavingCategory] = useState(false);
  const [deletingCategoryName, setDeletingCategoryName] = useState<string | null>(null);

  const [splitTarget, setSplitTarget] = useState<Transaction | null>(null);
  const [allocateTarget, setAllocateTarget] = useState<Transaction | null>(null);
  const [snapshotTarget, setSnapshotTarget] = useState<Transaction | null>(null);
  const [manualModalOpen, setManualModalOpen] = useState(false);
  const [reportModalOpen, setReportModalOpen] = useState(false);
  const [savingSplit, setSavingSplit] = useState(false);
  const [savingAllocate, setSavingAllocate] = useState(false);
  const [savingManual, setSavingManual] = useState(false);
  const [syncingMail, setSyncingMail] = useState(false);

  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const pushToast = useCallback((text: string, variant: ToastMessage['variant']) => {
    toastId += 1;
    setToasts((prev) => [...prev, { id: toastId, text, variant }]);
  }, []);

  const dismissToast = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const loadExpenses = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchExpenses();
      setTransactions(data);
      setUsingDemoData(false);
    } catch (err) {
      // The API base URL is a placeholder until a real backend is deployed.
      // Fall back to seed data so the dashboard still demonstrates real behavior.
      setError(
        err instanceof Error
          ? `Couldn't reach the API (${err.message}).`
          : "Couldn't reach the API."
      );
      setTransactions(SEED_TRANSACTIONS);
      setUsingDemoData(true);
    } finally {
      setLoading(false);
    }
  }, []);

  const loadBankAccounts = useCallback(async () => {
    setAccountsLoading(true);
    try {
      const data = await fetchBankAccounts();
      setBankAccounts(data);
    } catch {
      setBankAccounts([]);
    } finally {
      setAccountsLoading(false);
    }
  }, []);

  const loadAppSettings = useCallback(async () => {
    try {
      const data = await fetchAppSettings();
      setAppSettings(data);
    } catch {
      setAppSettings(null);
    }
  }, []);

  const loadCategories = useCallback(async () => {
    try {
      const data = await fetchCategories();
      setCategories(data);
    } catch {
      setCategories([]);
    }
  }, []);

  const loadAll = useCallback(() => {
    loadExpenses();
    loadBankAccounts();
    loadAppSettings();
    loadCategories();
  }, [loadExpenses, loadBankAccounts, loadAppSettings, loadCategories]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  async function handleSplitConfirm(shareAmount: number) {
    if (!splitTarget) return;
    setSavingSplit(true);
    const updated: Transaction = { ...splitTarget, isSplit: true, shareAmount };
    try {
      await updateExpense(splitTarget.id, { isSplit: true, shareAmount });
      pushToast('Split saved.', 'success');
    } catch {
      pushToast('Could not sync split to server — saved locally.', 'error');
    } finally {
      setTransactions((prev) => prev.map((t) => (t.id === updated.id ? updated : t)));
      setSavingSplit(false);
      setSplitTarget(null);
    }
  }

  async function handleAllocateConfirm(pool: string, allocationAmount: number) {
    if (!allocateTarget) return;
    setSavingAllocate(true);
    const updated: Transaction = { ...allocateTarget, isAllocated: true, allocationPool: pool, allocationAmount };
    try {
      await updateExpense(allocateTarget.id, { isAllocated: true, allocationPool: pool, allocationAmount });
      pushToast('Allocation saved.', 'success');
    } catch {
      pushToast('Could not sync allocation to server — saved locally.', 'error');
    } finally {
      setTransactions((prev) => prev.map((t) => (t.id === updated.id ? updated : t)));
      setSavingAllocate(false);
      setAllocateTarget(null);
    }
  }

  async function handleTagChange(tx: Transaction, pool: string) {
    const updated: Transaction = { ...tx, pool };
    setTransactions((prev) => prev.map((t) => (t.id === tx.id ? updated : t)));

    try {
      await updateExpense(tx.id, { pool });
    } catch {
      pushToast('Could not sync tag change to server — saved locally.', 'error');
    }
  }

  async function handleSpendDayChange(tx: Transaction, spendDay: string | null) {
    const updated: Transaction = { ...tx, effectiveDate: spendDay ?? undefined };
    setTransactions((prev) => prev.map((t) => (t.id === tx.id ? updated : t)));

    try {
      await updateExpense(tx.id, { effectiveDate: spendDay ?? '' });
      pushToast(spendDay ? 'Marked as spent on that day.' : 'Reset to its own date.', 'success');
    } catch (err) {
      pushToast(err instanceof Error ? err.message : 'Could not sync that change to server — saved locally.', 'error');
    }
  }

  async function handleCategoryChange(tx: Transaction, category: string) {
    const updated: Transaction = { ...tx, category };
    setTransactions((prev) => prev.map((t) => (t.id === tx.id ? updated : t)));

    try {
      await updateExpense(tx.id, { category });
    } catch {
      pushToast('Could not sync category change to server — saved locally.', 'error');
    }
  }

  async function handleAddCategory(name: string) {
    try {
      const saved = await addCategory(name);
      setCategories((prev) => (prev.includes(saved) ? prev : [...prev, saved]));
    } catch (err) {
      // Non-fatal — the category still gets used locally for this entry,
      // but flag it clearly: unlike every other optimistic update here,
      // this one won't be registered for next time until a retry
      // succeeds, so it'll just be gone again on reload if left silent.
      setCategories((prev) => (prev.includes(name) ? prev : [...prev, name]));
      pushToast(
        err instanceof Error ? err.message : 'Could not save that category — it will only last this session.',
        'error'
      );
    }
  }

  async function handleRenameCategory(name: string, newName: string) {
    setSavingCategory(true);
    try {
      const saved = await renameCategory(name, newName);
      // Renaming onto an existing category merges the two — drop the old
      // name rather than end up with a duplicate entry.
      setCategories((prev) => {
        const withoutOld = prev.filter((c) => c !== name);
        return withoutOld.includes(saved) ? withoutOld : [...withoutOld, saved];
      });
      setTransactions((prev) => prev.map((t) => (t.category === name ? { ...t, category: saved } : t)));
      pushToast(`Renamed to "${saved}".`, 'success');
    } catch (err) {
      pushToast(err instanceof Error ? err.message : 'Could not rename category.', 'error');
    } finally {
      setSavingCategory(false);
    }
  }

  async function handleDeleteCategory(name: string) {
    setDeletingCategoryName(name);
    try {
      await deleteCategory(name);
      setCategories((prev) => prev.filter((c) => c !== name));
      // Mirrors the backend: any transaction using the removed category
      // is reassigned to the built-in Other bucket, not left dangling.
      setTransactions((prev) => prev.map((t) => (t.category === name ? { ...t, category: 'Other' } : t)));
      pushToast('Category removed.', 'success');
    } catch (err) {
      pushToast(err instanceof Error ? err.message : 'Could not remove category.', 'error');
    } finally {
      setDeletingCategoryName(null);
    }
  }

  async function handleManualSubmit(input: ManualExpenseInput) {
    setSavingManual(true);
    const fallbackAccountId = input.accountId ?? bankAccounts.find((a) => a.isDefault)?.id ?? '';
    const optimistic: Transaction = {
      id: `local_${Date.now()}`,
      accountId: fallbackAccountId,
      merchant: input.merchant,
      category: input.category,
      amount: input.amount,
      date: new Date().toISOString(),
      source: input.isCashEntry ? 'Cash' : 'SMS',
      type: input.type,
      pool: input.pool,
      isSplit: false,
      isAllocated: false,
    };

    try {
      const saved = await createManualExpense(input);
      setTransactions((prev) => [saved, ...prev]);
      pushToast('Expense added.', 'success');
    } catch {
      setTransactions((prev) => [optimistic, ...prev]);
      pushToast('Could not sync to server — saved locally.', 'error');
    } finally {
      setSavingManual(false);
      setManualModalOpen(false);
      setReportModalOpen(false);
    }
  }

  async function handleAddAccount(input: BankAccountInput) {
    setSavingAccount(true);
    try {
      const saved = await addBankAccount(input);
      setBankAccounts((prev) => [...prev, saved]);
      pushToast('Bank account added.', 'success');
    } catch (err) {
      pushToast(err instanceof Error ? err.message : 'Could not add bank account.', 'error');
    } finally {
      setSavingAccount(false);
    }
  }

  async function handleUpdateAccount(id: string, input: BankAccountInput) {
    setSavingAccount(true);
    try {
      const saved = await updateBankAccount(id, input);
      setBankAccounts((prev) => prev.map((a) => (a.id === id ? saved : a)));
      pushToast('Bank account saved.', 'success');
    } catch (err) {
      pushToast(err instanceof Error ? err.message : 'Could not save bank account.', 'error');
    } finally {
      setSavingAccount(false);
    }
  }

  async function handleDeleteAccount(id: string) {
    setDeletingAccountId(id);
    try {
      await deleteBankAccount(id);
      setBankAccounts((prev) => prev.filter((a) => a.id !== id));
      if (accountFilter === id) setAccountFilter(ALL_ACCOUNTS);
      pushToast('Bank account removed.', 'success');
    } catch (err) {
      pushToast(err instanceof Error ? err.message : 'Could not remove bank account.', 'error');
    } finally {
      setDeletingAccountId(null);
    }
  }

  async function handleTransferPool(accountId: string, fromPool: string, toPool: string, amount: number) {
    setTransferringPool(true);
    try {
      const saved = await transferBetweenPools(accountId, fromPool, toPool, amount);
      setBankAccounts((prev) => prev.map((a) => (a.id === accountId ? saved : a)));
      pushToast(`Transferred ${formatCurrency(amount)} from ${fromPool} to ${toPool}.`, 'success');
    } catch (err) {
      pushToast(err instanceof Error ? err.message : 'Could not transfer between pools.', 'error');
    } finally {
      setTransferringPool(false);
    }
  }

  async function handleManagePools(accountId: string, pools: { name: string; amount: number }[]) {
    setSavingAccount(true);
    try {
      const saved = await manageAccountPools(accountId, pools);
      setBankAccounts((prev) => prev.map((account) => (account.id === accountId ? saved : account)));
      pushToast('Pool allocation updated. Transactions were not changed.', 'success');
    } catch (err) {
      pushToast(err instanceof Error ? err.message : 'Could not update pool allocation.', 'error');
      throw err;
    } finally {
      setSavingAccount(false);
    }
  }

  // Used from the "report a missing transaction" flow — the usual fix for
  // a missed transaction is "mail sync never had this sender configured,"
  // so let people add one right there instead of navigating to Accounts.
  async function handleAddAccountEmail(accountId: string, address: string) {
    setSavingEmail(true);
    try {
      const saved = await addBankAccountEmail(accountId, address);
      setBankAccounts((prev) => prev.map((a) => (a.id === accountId ? saved : a)));
      pushToast('Gmail address added — it will be scanned on the next sync.', 'success');
    } catch (err) {
      pushToast(err instanceof Error ? err.message : 'Could not add that address.', 'error');
    } finally {
      setSavingEmail(false);
    }
  }

  async function handleBudgetUpdate(value: number) {
    try {
      const saved = await updateMonthlyBudget(value);
      setAppSettings(saved);
      pushToast('Monthly budget updated.', 'success');
    } catch {
      setAppSettings((prev) => ({ ...(prev ?? {}), monthlyBudget: value }));
      pushToast('Could not sync budget to server — saved locally.', 'error');
    }
  }

  async function handleSyncMail() {
    setSyncingMail(true);
    try {
      const result = await syncMail();
      if (result.added > 0) {
        await loadExpenses();
      }
      pushToast(
        `Mail sync: ${result.added} added, ${result.skipped} skipped, ${result.scanned} processed${
          result.deferred > 0 ? `, ${result.deferred} queued for the next sync` : ''
        }${typeof result.rule_parsed === 'number' ? ` · ${result.rule_parsed} instant, ${result.ai_classified ?? 0} via AI` : ''}.`,
        'success'
      );
      if ((result.template_drift ?? 0) > 0) {
        pushToast(
          `${result.template_drift} HDFC email${result.template_drift === 1 ? '' : 's'} used AI fallback because the template was unfamiliar.`,
          'error'
        );
      }
      // A partial failure (a classification error, a rate limit, ...)
      // still returns 200 with the errors listed rather than throwing —
      // surface those too, or they'd be invisible next to the success toast.
      if (result.errors.length > 0) {
        pushToast(
          `${result.errors.length} email${result.errors.length > 1 ? 's' : ''} couldn't be processed — they'll be retried on the next sync.`,
          'error'
        );
      }
    } catch (err) {
      pushToast(err instanceof Error ? err.message : 'Mail sync failed.', 'error');
    } finally {
      setSyncingMail(false);
    }
  }

  const { title, subtitle } = VIEW_TITLES[view];

  // The dashboard filter: every real account (combined) or just one. Falls
  // back to "all" if the selected account was deleted out from under it.
  // "All accounts" deliberately excludes the Deleted Accounts archive —
  // its history is still viewable by picking it directly from the filter,
  // or on the Transactions page, just never folded into the combined
  // total.
  const combinableAccounts = useMemo(() => bankAccounts.filter((a) => !a.isArchive), [bankAccounts]);
  const accountsInView = useMemo(
    () =>
      accountFilter === ALL_ACCOUNTS
        ? combinableAccounts
        : bankAccounts.filter((a) => a.id === accountFilter).length > 0
        ? bankAccounts.filter((a) => a.id === accountFilter)
        : combinableAccounts,
    [bankAccounts, combinableAccounts, accountFilter]
  );

  // Totals/analytics only count what happened since each account's setup
  // was anchored — older synced transactions still show in the transaction
  // list for reference, but don't inflate spend numbers the starting
  // balance already accounts for. None of that applies to the offline
  // demo fallback, though: SEED_TRANSACTIONS all carry a placeholder
  // accountId ('seed') that never matches a real account, and bank
  // accounts fail to load independently of expenses during the same
  // outage — without this bypass, every view would render completely
  // empty instead of the demo data the banner promises.
  const transactionsForTotals = usingDemoData
    ? transactions
    : transactionsSinceAnchorForAccounts(accountsInView, transactions);
  // Budget language is explicitly monthly. Keep the broader post-anchor
  // list for analytics, balances, and history, but never carry a previous
  // month's spend into the current month's budget meter.
  const transactionsForCurrentMonth = transactionsInMonth(transactionsForTotals);
  const visibleTransactions = usingDemoData
    ? transactions
    : transactions.filter((t) => accountsInView.some((a) => a.id === t.accountId));


  const belowMinimumAccounts = bankAccounts.filter((a) => {
    if (!a.anchoredAt || a.minBalance <= 0) return false;
    return combineLiveBalance([a], transactions) < a.minBalance;
  });

  const showAccountFilter = view === 'dashboard' || view === 'transactions';

  return (
    <div className="flex min-h-screen bg-zinc-950">
      <Sidebar
        active={view}
        onNavigate={setView}
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        personalSpend={personalSpendTotal(transactionsForCurrentMonth)}
        monthlyBudget={appSettings?.monthlyBudget || MONTHLY_BUDGET_DEFAULT}
        userEmail={user.email}
        onLogout={onLogout}
      />

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 flex min-h-16 items-center gap-2 border-b border-white/5 bg-zinc-950/90 px-3 py-3 backdrop-blur sm:h-16 sm:gap-3 sm:px-6 sm:py-0">
          <div className="flex min-w-0 flex-1 items-center gap-2 sm:flex-none sm:gap-3">
            <button
              onClick={() => setSidebarOpen(true)}
              className="shrink-0 rounded-lg p-2 text-zinc-400 hover:bg-white/5 hover:text-zinc-200 lg:hidden"
              aria-label="Open menu"
            >
              <Menu size={20} />
            </button>
            <div className="min-w-0">
              <h1 className="truncate text-base font-semibold text-zinc-100">{title}</h1>
              <p className="hidden truncate text-xs text-zinc-500 sm:block">{subtitle}</p>
            </div>
          </div>

          <div className="ml-auto flex min-w-0 shrink-0 items-center gap-2">
            {showAccountFilter && bankAccounts.length > 1 && (
              <select
                value={accountFilter}
                onChange={(e) => setAccountFilter(e.target.value)}
                aria-label="Account filter"
                className="h-10 w-[clamp(5.5rem,28vw,9rem)] min-w-0 truncate rounded-xl border border-white/10 bg-white/5 px-2 text-xs font-medium text-zinc-300 outline-none focus:border-emerald-500/50 sm:h-auto sm:w-auto sm:px-3 sm:py-2"
              >
                <option value={ALL_ACCOUNTS} className="bg-zinc-900 text-zinc-100">All accounts</option>
                {bankAccounts.map((a) => (
                  <option key={a.id} value={a.id} className="bg-zinc-900 text-zinc-100">
                    {a.bank}
                  </option>
                ))}
              </select>
            )}
            <QuickActions key={view} loading={loading} syncing={syncingMail}
              onRefresh={loadAll} onSync={handleSyncMail}
              onReport={() => setReportModalOpen(true)} onAdd={() => setManualModalOpen(true)} />
          </div>
        </header>

        <main className="min-w-0 flex-1 space-y-5 overflow-x-hidden p-3 pb-[calc(1rem+env(safe-area-inset-bottom))] sm:p-6">
          {error && (
            <ErrorBanner
              message={`${error}${usingDemoData ? ' Showing demo data instead.' : ''}`}
              onRetry={loadAll}
            />
          )}

          {belowMinimumAccounts.length > 0 && view === 'dashboard' && (
            <div className="rounded-2xl border border-red-500/20 bg-red-500/5 p-3 text-xs text-red-300">
              Below minimum balance: {belowMinimumAccounts.map((a) => a.bank).join(', ')}
            </div>
          )}

          {view === 'dashboard' && (
            <>
              <SummaryCards
                transactions={transactionsForCurrentMonth}
                loading={loading}
                monthlyBudget={appSettings?.monthlyBudget || MONTHLY_BUDGET_DEFAULT}
                onUpdateBudget={handleBudgetUpdate}
                onOpenSpendByDay={() => setView('personalSpend')}
              >
                <AccountOverviewCard
                  accounts={accountsInView}
                  transactions={transactions}
                  loading={accountsLoading}
                  onConfigure={() => setView('account')}
                />
              </SummaryCards>
              <div>
                <div className="mb-3 flex items-center justify-between">
                  <h2 className="text-sm font-semibold text-zinc-200">Recent transactions</h2>
                  <button
                    onClick={() => setView('transactions')}
                    className="text-xs font-medium text-emerald-400 hover:text-emerald-300"
                  >
                    View all
                  </button>
                </div>
                <TransactionsTable
                  transactions={visibleTransactions}
                  accounts={bankAccounts}
                  categories={categories}
                  loading={loading}
                  limit={6}
                  onSplit={setSplitTarget}
                  onAllocate={setAllocateTarget}
                  onViewSnapshot={setSnapshotTarget}
                  onTagChange={handleTagChange}
                  onCategoryChange={handleCategoryChange}
                  onAddCategory={handleAddCategory}
                  onSpendDayChange={handleSpendDayChange}
                />
              </div>
            </>
          )}

          {view === 'transactions' && (
            <TransactionsTable
              transactions={visibleTransactions}
              accounts={bankAccounts}
              categories={categories}
              loading={loading}
              showFilters
              onSplit={setSplitTarget}
              onAllocate={setAllocateTarget}
              onViewSnapshot={setSnapshotTarget}
              onTagChange={handleTagChange}
              onCategoryChange={handleCategoryChange}
              onAddCategory={handleAddCategory}
              onSpendDayChange={handleSpendDayChange}
            />
          )}

          {view === 'manual' && (
            <div className="mx-auto max-w-md rounded-2xl border border-white/5 bg-zinc-900/60 p-4 sm:p-6">
              <h2 className="text-sm font-semibold text-zinc-100">Log a cash expense</h2>
              <p className="mt-1 text-xs text-zinc-500">
                Cash purchases don't hit your bank SMS or PhonePe feed — add them here so they count
                toward your totals.
              </p>
              <div className="mt-5">
                <ManualEntryForm
                  categories={categories}
                  accounts={bankAccounts}
                  onSubmit={handleManualSubmit}
                  onAddCategory={handleAddCategory}
                  submitting={savingManual}
                />
              </div>
            </div>
          )}

          {view === 'analytics' && <Analytics transactions={transactionsForTotals} />}

          {view === 'account' && (
            <div className="mx-auto max-w-md rounded-2xl border border-white/5 bg-zinc-900/60 p-4 sm:p-6">
              <h2 className="text-sm font-semibold text-zinc-100">{isNewUser ? 'Set up your account' : 'Bank accounts'}</h2>
              <p className="mt-1 text-xs text-zinc-500">
                {isNewUser
                  ? 'Start by connecting Gmail, then add your bank balance and pools. Nothing from another user is visible here.'
                  : "Every bank account you track — its balance, pools, and sender addresses. Each signed-in user's data stays separate."}
              </p>
              <div className="mt-5">
                <GmailConnectionCard onError={(message) => pushToast(message, 'error')} />
                <BankAccountsManager
                  accounts={bankAccounts}
                  transactions={transactions}
                  loading={accountsLoading}
                  saving={savingAccount}
                  deletingId={deletingAccountId}
                  transferring={transferringPool}
                  onAdd={handleAddAccount}
                  onUpdate={handleUpdateAccount}
                  onDelete={handleDeleteAccount}
                  onTransferPool={handleTransferPool}
                  onManagePools={handleManagePools}
                />
              </div>
            </div>
          )}

          {view === 'categories' && (
            <div className="mx-auto max-w-md rounded-2xl border border-white/5 bg-zinc-900/60 p-4 sm:p-6">
              <h2 className="text-sm font-semibold text-zinc-100">Categories</h2>
              <p className="mt-1 text-xs text-zinc-500">
                Rename or remove any category you've added. Renaming (or merging onto an existing
                name) updates every transaction that used it; deleting one moves its transactions
                to Other.
              </p>
              <div className="mt-5">
                <CategoriesManager
                  categories={categories}
                  transactions={transactions}
                  saving={savingCategory}
                  deletingName={deletingCategoryName}
                  onAdd={handleAddCategory}
                  onRename={handleRenameCategory}
                  onDelete={handleDeleteCategory}
                />
              </div>
            </div>
          )}

          {view === 'personalSpend' && (
            <div className="space-y-3">
              <button
                onClick={() => setView('dashboard')}
                className="text-xs font-medium text-emerald-400 hover:text-emerald-300"
              >
                ← Back to Dashboard
              </button>
              <PersonalSpendPage accountId={accountFilter === ALL_ACCOUNTS ? undefined : accountFilter} />
            </div>
          )}
        </main>
      </div>

      {splitTarget && (
        <SplitModal
          transaction={splitTarget}
          onClose={() => setSplitTarget(null)}
          onConfirm={handleSplitConfirm}
          submitting={savingSplit}
        />
      )}

      {allocateTarget && (
        <AllocateModal
          transaction={allocateTarget}
          pools={
            bankAccounts.find((a) => a.id === allocateTarget.accountId)?.pools.map((p) => p.name) ?? [
              DEFAULT_POOL_NAME,
            ]
          }
          onClose={() => setAllocateTarget(null)}
          onConfirm={handleAllocateConfirm}
          submitting={savingAllocate}
        />
      )}

      {snapshotTarget && bankAccounts.find((account) => account.id === snapshotTarget.accountId) && (
        <AccountSnapshotModal
          transaction={snapshotTarget}
          account={bankAccounts.find((account) => account.id === snapshotTarget.accountId)!}
          transactions={transactions}
          onClose={() => setSnapshotTarget(null)}
        />
      )}

      {manualModalOpen && (
        <ManualEntryModal
          categories={categories}
          accounts={bankAccounts}
          onClose={() => setManualModalOpen(false)}
          onSubmit={handleManualSubmit}
          onAddCategory={handleAddCategory}
          submitting={savingManual}
        />
      )}

      {reportModalOpen && (
        <ManualEntryModal
          categories={categories}
          accounts={bankAccounts}
          onClose={() => setReportModalOpen(false)}
          onSubmit={handleManualSubmit}
          onAddCategory={handleAddCategory}
          onAddAccountEmail={handleAddAccountEmail}
          savingEmail={savingEmail}
          submitting={savingManual}
          reportMode
        />
      )}

      <ToastStack toasts={toasts} onDismiss={dismissToast} />
    </div>
  );
}
