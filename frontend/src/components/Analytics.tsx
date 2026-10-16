import React, { useMemo } from 'react';
import { Category, DEFAULT_POOL_NAME, Transaction, effectiveAmount } from '../types';
import { categoryBarClass, poolBarClass } from '../constants';
import { formatCurrency } from '../utils/format';

interface AnalyticsProps {
  transactions: Transaction[];
}

export default function Analytics({ transactions }: AnalyticsProps) {
  // Money moved into Savings isn't "spend" in the categorization sense —
  // excluded here same as before. Pools are user-named now, so this only
  // recognizes a pool literally called "savings" (case/whitespace
  // insensitive) — a pool serving the same purpose under a different name
  // (e.g. "Emergency Fund") still won't be excluded.
  const spendable = useMemo(
    () => transactions.filter((t) => t.pool.trim().toLowerCase() !== 'savings' && t.type !== 'Credit'),
    [transactions]
  );

  const byCategory = useMemo(() => {
    const totals = new Map<Category, number>();
    for (const tx of spendable) {
      totals.set(tx.category, (totals.get(tx.category) ?? 0) + effectiveAmount(tx));
    }
    const max = Math.max(1, ...Array.from(totals.values()));
    return Array.from(totals.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([category, total]) => ({ category, total, pct: Math.round((total / max) * 100) }));
  }, [spendable]);

  const byPool = useMemo(() => {
    const totals = new Map<string, number>();
    for (const tx of spendable) {
      const name = tx.pool || DEFAULT_POOL_NAME;
      totals.set(name, (totals.get(name) ?? 0) + effectiveAmount(tx));
    }
    const max = Math.max(1, ...Array.from(totals.values()));
    return Array.from(totals.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([pool, total]) => ({ pool, total, pct: Math.round((total / max) * 100) }));
  }, [spendable]);

  const bySource = useMemo(() => {
    const totals = new Map<string, number>();
    for (const tx of spendable) {
      totals.set(tx.source, (totals.get(tx.source) ?? 0) + effectiveAmount(tx));
    }
    return Array.from(totals.entries()).sort((a, b) => b[1] - a[1]);
  }, [spendable]);

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      {/* Category breakdown */}
      <div className="rounded-2xl border border-white/5 bg-zinc-900/60 p-5 lg:col-span-2">
        <h3 className="text-sm font-semibold text-zinc-100">Spending by category</h3>
        <p className="mt-0.5 text-xs text-zinc-500">Savings transfers &amp; credits excluded</p>

        <div className="mt-5 space-y-3.5">
          {byCategory.map(({ category, total, pct }) => (
            <div key={category}>
              <div className="mb-1.5 flex items-center justify-between text-xs">
                <span className="font-medium text-zinc-300">{category}</span>
                <span className="text-zinc-500">{formatCurrency(total)}</span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-white/5">
                <div className={`h-full rounded-full ${categoryBarClass(category)}`} style={{ width: `${pct}%` }} />
              </div>
            </div>
          ))}
          {byCategory.length === 0 && <p className="text-sm text-zinc-500">No data yet.</p>}
        </div>
      </div>

      {/* By pool — Personal, Business, Savings, or whatever the user's set up */}
      <div className="rounded-2xl border border-white/5 bg-zinc-900/60 p-5">
        <h3 className="text-sm font-semibold text-zinc-100">Spending by pool</h3>
        <p className="mt-0.5 text-xs text-zinc-500">Savings transfers &amp; credits excluded</p>
        <div className="mt-5 space-y-3.5">
          {byPool.map(({ pool, total, pct }) => (
            <div key={pool}>
              <div className="mb-1.5 flex items-center justify-between text-xs">
                <span className="font-medium text-zinc-300">{pool}</span>
                <span className="text-zinc-500">{formatCurrency(total)}</span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-white/5">
                <div className={`h-full rounded-full ${poolBarClass(pool)}`} style={{ width: `${pct}%` }} />
              </div>
            </div>
          ))}
          {byPool.length === 0 && <p className="text-sm text-zinc-500">No data yet.</p>}
        </div>
      </div>

      {/* By source */}
      <div className="rounded-2xl border border-white/5 bg-zinc-900/60 p-5">
        <h3 className="text-sm font-semibold text-zinc-100">Spending by source</h3>
        <div className="mt-5 space-y-4">
          {bySource.map(([source, total]) => (
            <div key={source} className="flex items-center justify-between">
              <span className="text-sm text-zinc-300">{source}</span>
              <span className="text-sm font-medium text-zinc-100">{formatCurrency(total)}</span>
            </div>
          ))}
          {bySource.length === 0 && <p className="text-sm text-zinc-500">No data yet.</p>}
        </div>
      </div>
    </div>
  );
}
