import React, { useMemo, useState } from 'react';
import { SplitSquareHorizontal, PieChart, ArrowDownLeft, Search, Inbox, SlidersHorizontal } from 'lucide-react';
import { BankAccount, DEFAULT_POOL_NAME, Transaction, poolNamesAt } from '../types';
import { poolBadgeClass, poolDotClass } from '../constants';
import { formatCurrency } from '../utils/format';
import ActionsMenu from './ActionsMenu';
import CategoryBadge from './CategoryBadge';
import SpendDayBadge from './SpendDayBadge';
import SourceIcon from './SourceIcon';
import { TableRowSkeleton } from './Skeletons';

interface TransactionsTableProps {
  transactions: Transaction[];
  accounts: BankAccount[];
  categories: string[];
  loading: boolean;
  limit?: number;
  showFilters?: boolean;
  onSplit: (tx: Transaction) => void;
  onAllocate: (tx: Transaction) => void;
  onViewSnapshot: (tx: Transaction) => void;
  onTagChange: (tx: Transaction, pool: string) => void;
  onCategoryChange: (tx: Transaction, category: string) => void;
  onAddCategory?: (name: string) => Promise<void> | void;
  /** Sets/clears which day a transaction's spend counts toward, e.g. "this actually happened yesterday" — see SpendDayBadge. Pass null to clear. */
  onSpendDayChange: (tx: Transaction, spendDay: string | null) => void;
}

export default function TransactionsTable({
  transactions,
  accounts,
  categories,
  loading,
  limit,
  showFilters = false,
  onSplit,
  onAllocate,
  onViewSnapshot,
  onTagChange,
  onCategoryChange,
  onAddCategory,
  onSpendDayChange,
}: TransactionsTableProps) {
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<string>('All');
  const [pool, setPool] = useState<string>('All');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [amountMin, setAmountMin] = useState('');
  const [amountMax, setAmountMax] = useState('');
  const [moreFiltersOpen, setMoreFiltersOpen] = useState(false);

  const accountById = useMemo(() => new Map(accounts.map((a) => [a.id, a])), [accounts]);

  // Every pool name across every account, deduped — Personal first (it
  // always exists), then whatever Business/Savings/custom pools any
  // account has defined, so the filter covers pools regardless of which
  // account a transaction landed on.
  const poolOptions = useMemo(() => {
    const names = new Set<string>([DEFAULT_POOL_NAME]);
    for (const account of accounts) {
      for (const p of account.pools) names.add(p.name);
      for (const p of account.poolHistory || []) names.add(p.name);
    }
    for (const transaction of transactions) {
      names.add(transaction.pool || DEFAULT_POOL_NAME);
      if (transaction.allocationPool) names.add(transaction.allocationPool);
    }
    return [DEFAULT_POOL_NAME, ...Array.from(names).filter((n) => n !== DEFAULT_POOL_NAME).sort()];
  }, [accounts, transactions]);

  const minValue = parseFloat(amountMin);
  const maxValue = parseFloat(amountMax);
  const fromTime = dateFrom ? new Date(dateFrom).getTime() : null;
  // End-of-day for the "to" bound so a same-day filter includes that day's transactions.
  const toTime = dateTo ? new Date(dateTo).getTime() + 24 * 60 * 60 * 1000 - 1 : null;

  const filtered = useMemo(() => {
    let list = transactions;
    if (category !== 'All') list = list.filter((t) => t.category === category);
    if (pool !== 'All') list = list.filter((t) => (t.pool || DEFAULT_POOL_NAME) === pool);
    if (query.trim()) {
      const q = query.trim().toLowerCase();
      list = list.filter((t) => t.merchant.toLowerCase().includes(q));
    }
    if (fromTime != null) list = list.filter((t) => new Date(t.date).getTime() >= fromTime);
    if (toTime != null) list = list.filter((t) => new Date(t.date).getTime() <= toTime);
    if (!Number.isNaN(minValue)) list = list.filter((t) => t.amount >= minValue);
    if (!Number.isNaN(maxValue)) list = list.filter((t) => t.amount <= maxValue);
    const sorted = [...list].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    return limit ? sorted.slice(0, limit) : sorted;
  }, [transactions, query, category, pool, fromTime, toTime, minValue, maxValue, limit]);

  const activeExtraFilters = [dateFrom, dateTo, amountMin, amountMax].filter(Boolean).length;

  return (
    <div className="rounded-2xl border border-white/5 bg-zinc-900/60">
      {showFilters && (
        <div className="border-b border-white/5 p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="relative w-full sm:max-w-xs">
              <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search merchant…"
                className="w-full rounded-lg border border-white/10 bg-white/5 py-2 pl-8 pr-3 text-sm text-zinc-200 outline-none placeholder:text-zinc-600 focus:border-emerald-500/50 focus:ring-1 focus:ring-emerald-500/50"
              />
            </div>
            <div className="grid grid-cols-2 gap-2 sm:flex sm:items-center">
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="min-w-0 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-zinc-200 outline-none focus:border-emerald-500/50 focus:ring-1 focus:ring-emerald-500/50"
              >
                <option value="All" className="bg-zinc-900 text-zinc-100">All categories</option>
                {categories.map((c) => (
                  <option key={c} value={c} className="bg-zinc-900 text-zinc-100">
                    {c}
                  </option>
                ))}
              </select>
              <select
                value={pool}
                onChange={(e) => setPool(e.target.value)}
                className="min-w-0 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-zinc-200 outline-none focus:border-emerald-500/50 focus:ring-1 focus:ring-emerald-500/50"
              >
                <option value="All" className="bg-zinc-900 text-zinc-100">All pools</option>
                {poolOptions.map((p) => (
                  <option key={p} value={p} className="bg-zinc-900 text-zinc-100">
                    {p}
                  </option>
                ))}
              </select>
              <button
                onClick={() => setMoreFiltersOpen((o) => !o)}
                className={`col-span-2 inline-flex items-center justify-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-medium transition-colors sm:col-auto ${
                  moreFiltersOpen || activeExtraFilters > 0
                    ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
                    : 'border-white/10 bg-white/5 text-zinc-300 hover:bg-white/10'
                }`}
              >
                <SlidersHorizontal size={14} />
                Filters
                {activeExtraFilters > 0 && (
                  <span className="rounded-full bg-emerald-500/20 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-300">
                    {activeExtraFilters}
                  </span>
                )}
              </button>
            </div>
          </div>

          {moreFiltersOpen && (
            <div className="transaction-filters mt-4 grid min-w-0 grid-cols-2 gap-x-3 gap-y-2 border-t border-white/5 pt-4">
              <div className="col-span-2 mb-1 text-xs font-medium text-zinc-300">Date range</div>
              <div className="min-w-0">
                <label htmlFor="filter-date-from" className="mb-1 block text-[11px] font-medium text-zinc-500">From</label>
                <input
                  id="filter-date-from"
                  type="date"
                  value={dateFrom}
                  onChange={(e) => setDateFrom(e.target.value)}
                  className="block h-10 w-full min-w-0 max-w-full rounded-lg border border-white/10 bg-white/5 px-2.5 text-xs text-zinc-200 outline-none focus:border-emerald-500/50"
                />
              </div>
              <div className="min-w-0">
                <label htmlFor="filter-date-to" className="mb-1 block text-[11px] font-medium text-zinc-500">To</label>
                <input
                  id="filter-date-to"
                  type="date"
                  value={dateTo}
                  onChange={(e) => setDateTo(e.target.value)}
                  className="block h-10 w-full min-w-0 max-w-full rounded-lg border border-white/10 bg-white/5 px-2.5 text-xs text-zinc-200 outline-none focus:border-emerald-500/50"
                />
              </div>
              <div className="col-span-2 mb-1 mt-3 text-xs font-medium text-zinc-300">Amount range</div>
              <div className="min-w-0">
                <label htmlFor="filter-amount-min" className="mb-1 block text-[11px] font-medium text-zinc-500">Minimum</label>
                <input
                  id="filter-amount-min"
                  type="number"
                  min={0}
                  value={amountMin}
                  onChange={(e) => setAmountMin(e.target.value)}
                  placeholder="₹0"
                  className="block h-10 w-full min-w-0 max-w-full rounded-lg border border-white/10 bg-white/5 px-2.5 text-xs text-zinc-200 outline-none placeholder:text-zinc-600 focus:border-emerald-500/50"
                />
              </div>
              <div className="min-w-0">
                <label htmlFor="filter-amount-max" className="mb-1 block text-[11px] font-medium text-zinc-500">Maximum</label>
                <input
                  id="filter-amount-max"
                  type="number"
                  min={0}
                  value={amountMax}
                  onChange={(e) => setAmountMax(e.target.value)}
                  placeholder="No limit"
                  className="block h-10 w-full min-w-0 max-w-full rounded-lg border border-white/10 bg-white/5 px-2.5 text-xs text-zinc-200 outline-none placeholder:text-zinc-600 focus:border-emerald-500/50"
                />
              </div>
              {activeExtraFilters > 0 && (
                <button
                  onClick={() => {
                    setDateFrom('');
                    setDateTo('');
                    setAmountMin('');
                    setAmountMax('');
                  }}
                  className="col-span-2 mt-2 py-2 text-left text-xs font-medium text-emerald-400 hover:text-emerald-300"
                >
                  Clear these filters
                </button>
              )}
            </div>
          )}
        </div>
      )}

      <div className="space-y-2 bg-zinc-950 p-2 md:hidden">
        {loading &&
          Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="animate-pulse p-4">
              <div className="flex justify-between gap-4">
                <div className="h-4 w-36 rounded bg-white/5" />
                <div className="h-4 w-20 rounded bg-white/5" />
              </div>
              <div className="mt-3 h-3 w-48 rounded bg-white/5" />
            </div>
          ))}

        {!loading && filtered.length === 0 && (
          <div className="flex flex-col items-center gap-2 px-4 py-14 text-zinc-500">
            <Inbox size={22} />
            <span className="text-sm">No transactions found</span>
          </div>
        )}

        {!loading &&
          filtered.map((tx) => {
            const effective = tx.isSplit && tx.shareAmount != null ? tx.shareAmount : tx.amount;
            const account = accountById.get(tx.accountId);
            return (
              <article key={tx.id} className="space-y-2 rounded-xl border border-white/5 bg-zinc-900/60 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="break-words text-sm font-medium leading-5 text-zinc-100">{tx.merchant}</div>
                    <div className="mt-1 flex flex-wrap items-center gap-1.5">
                      <span className="text-[11px] text-zinc-500">{account?.bank ?? '—'}</span>
                      {tx.type === 'Credit' && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium text-emerald-300 ring-1 ring-inset ring-emerald-500/25">
                          <ArrowDownLeft size={10} /> Credit
                        </span>
                      )}
                      {(tx.pool || DEFAULT_POOL_NAME) !== DEFAULT_POOL_NAME && (
                        <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium ring-1 ring-inset ${poolBadgeClass(tx.pool)}`}>
                          <span className={`h-1.5 w-1.5 rounded-full ${poolDotClass(tx.pool)}`} />
                          {tx.pool}
                        </span>
                      )}
                      {tx.isSplit && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-violet-500/10 px-2 py-0.5 text-[10px] font-medium text-violet-300 ring-1 ring-inset ring-violet-500/25">
                          <SplitSquareHorizontal size={10} /> Split
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="shrink-0 text-right">
                    <div className={`font-semibold ${tx.type === 'Credit' ? 'text-emerald-400' : 'text-zinc-100'}`}>
                      {tx.type === 'Credit' ? '+' : ''}{formatCurrency(effective)}
                    </div>
                    {tx.isSplit && <div className="text-[10px] text-zinc-500">of {formatCurrency(tx.amount)}</div>}
                  </div>
                </div>

                {tx.isAllocated && tx.allocationPool && tx.allocationAmount != null && (
                  <div className="mt-2 inline-flex items-center gap-1 rounded-full bg-fuchsia-500/10 px-2 py-0.5 text-[10px] font-medium text-fuchsia-300 ring-1 ring-inset ring-fuchsia-500/25">
                    <PieChart size={10} /> {formatCurrency(tx.allocationAmount)} → {tx.allocationPool}
                  </div>
                )}

                <div className="flex items-center justify-between gap-3 text-xs text-zinc-400">
                  <SpendDayBadge transaction={tx} onChange={(spendDay) => onSpendDayChange(tx, spendDay)} />
                  <span className="shrink-0"><SourceIcon source={tx.source} /></span>
                </div>

                <div className="flex items-center justify-between gap-3 border-t border-white/5 pt-2">
                  <div className="min-w-0 max-w-[calc(100%-3.5rem)]">
                  <CategoryBadge
                    category={tx.category}
                    categories={categories}
                    onChange={(nextCategory) => onCategoryChange(tx, nextCategory)}
                    onAddCategory={onAddCategory}
                  />
                  </div>
                  <div className="shrink-0">
                    <ActionsMenu
                      transaction={tx}
                      pools={account ? poolNamesAt(account, tx.date) : [DEFAULT_POOL_NAME]}
                      onSplit={onSplit}
                      onAllocate={onAllocate}
                      onViewSnapshot={onViewSnapshot}
                      onTagChange={(nextPool) => onTagChange(tx, nextPool)}
                    />
                  </div>
                </div>
              </article>
            );
          })}
      </div>

      <div className="scrollbar-thin hidden overflow-x-auto md:block">
        <table className="w-full min-w-[900px] text-left text-sm">
          <thead>
            <tr className="border-b border-white/5 text-xs uppercase tracking-wide text-zinc-500">
              <th className="px-4 py-3 font-medium">Merchant</th>
              <th className="px-4 py-3 font-medium">Account</th>
              <th className="px-4 py-3 font-medium">Category</th>
              <th className="px-4 py-3 font-medium">Amount</th>
              <th className="px-4 py-3 font-medium">Date</th>
              <th className="px-4 py-3 font-medium">Source</th>
              <th className="px-4 py-3 font-medium text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading &&
              Array.from({ length: 5 }).map((_, i) => <TableRowSkeleton key={i} />)}

            {!loading && filtered.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-14 text-center">
                  <div className="flex flex-col items-center gap-2 text-zinc-500">
                    <Inbox size={22} />
                    <span className="text-sm">No transactions found</span>
                  </div>
                </td>
              </tr>
            )}

            {!loading &&
              filtered.map((tx) => {
                const effective = tx.isSplit && tx.shareAmount != null ? tx.shareAmount : tx.amount;
                const account = accountById.get(tx.accountId);
                return (
                  <tr key={tx.id} className="border-b border-white/5 last:border-0 hover:bg-white/[0.02]">
                    <td className="px-4 py-4">
                      <div className="font-medium text-zinc-100">{tx.merchant}</div>
                      <div className="mt-1 flex flex-wrap gap-1.5">
                        {tx.type === 'Credit' && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium text-emerald-300 ring-1 ring-inset ring-emerald-500/25">
                            <ArrowDownLeft size={10} /> Credit
                          </span>
                        )}
                        {(tx.pool || DEFAULT_POOL_NAME) !== DEFAULT_POOL_NAME && (
                          <span
                            className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium ring-1 ring-inset ${poolBadgeClass(
                              tx.pool
                            )}`}
                          >
                            <span className={`h-1.5 w-1.5 rounded-full ${poolDotClass(tx.pool)}`} />
                            {tx.pool}
                          </span>
                        )}
                        {tx.isSplit && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-violet-500/10 px-2 py-0.5 text-[10px] font-medium text-violet-300 ring-1 ring-inset ring-violet-500/25">
                            <SplitSquareHorizontal size={10} /> Split
                          </span>
                        )}
                        {tx.isAllocated && tx.allocationPool && tx.allocationAmount != null && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-fuchsia-500/10 px-2 py-0.5 text-[10px] font-medium text-fuchsia-300 ring-1 ring-inset ring-fuchsia-500/25">
                            <PieChart size={10} /> {formatCurrency(tx.allocationAmount)} → {tx.allocationPool}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-4">
                      <span className="whitespace-nowrap rounded-full bg-white/5 px-2 py-0.5 text-[11px] font-medium text-zinc-400 ring-1 ring-inset ring-white/10">
                        {account?.bank ?? '—'}
                      </span>
                    </td>
                    <td className="px-4 py-4">
                      <CategoryBadge
                        category={tx.category}
                        categories={categories}
                        onChange={(category) => onCategoryChange(tx, category)}
                        onAddCategory={onAddCategory}
                      />
                    </td>
                    <td className="px-4 py-4">
                      <div className={`font-medium ${tx.type === 'Credit' ? 'text-emerald-400' : 'text-zinc-100'}`}>
                        {tx.type === 'Credit' ? '+' : ''}
                        {formatCurrency(effective)}
                      </div>
                      {tx.isSplit && (
                        <div className="text-[11px] text-zinc-500">of {formatCurrency(tx.amount)}</div>
                      )}
                    </td>
                    <td className="px-4 py-4 text-zinc-400">
                      <SpendDayBadge transaction={tx} onChange={(spendDay) => onSpendDayChange(tx, spendDay)} />
                    </td>
                    <td className="px-4 py-4">
                      <SourceIcon source={tx.source} />
                    </td>
                    <td className="px-4 py-4">
                      <div className="flex items-center justify-end">
                        <ActionsMenu
                          transaction={tx}
                          pools={account ? poolNamesAt(account, tx.date) : [DEFAULT_POOL_NAME]}
                          onSplit={onSplit}
                          onAllocate={onAllocate}
                          onViewSnapshot={onViewSnapshot}
                          onTagChange={(pool) => onTagChange(tx, pool)}
                        />
                      </div>
                    </td>
                  </tr>
                );
              })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
