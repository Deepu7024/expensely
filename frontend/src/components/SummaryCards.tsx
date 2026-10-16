import React, { useMemo, useState } from 'react';
import { Wallet, Target, Pencil, Check, X, CalendarDays, Receipt } from 'lucide-react';
import { DEFAULT_POOL_NAME, Transaction, effectiveAmount, effectiveSpendDay, localDayKey } from '../types';
import { formatCurrency } from '../utils/format';
import { SummaryCardSkeleton } from './Skeletons';

interface SummaryCardsProps {
  transactions: Transaction[];
  loading: boolean;
  monthlyBudget: number;
  /** Saves a new monthly budget — hits its own endpoint, never touches the balance/anchor. */
  onUpdateBudget: (value: number) => Promise<void> | void;
  /** Navigates to the Personal Spend by day page — a real page, not a modal, so it gets its own back-via-sidebar-nav flow. */
  onOpenSpendByDay: () => void;
  /** An extra card slotted into the same grid, e.g. AccountOverviewCard. */
  children?: React.ReactNode;
}

export default function SummaryCards({
  transactions,
  loading,
  monthlyBudget,
  onUpdateBudget,
  onOpenSpendByDay,
  children,
}: SummaryCardsProps) {
  const [editingBudget, setEditingBudget] = useState(false);
  const [budgetInput, setBudgetInput] = useState('');
  const [savingBudget, setSavingBudget] = useState(false);

  const { personalTotal, otherPoolsTotal, dailyTotal } = useMemo(() => {
    let personal = 0;
    let other = 0;
    let daily = 0;
    const todayKey = localDayKey(new Date().toISOString());
    for (const tx of transactions) {
      if (tx.type === 'Credit') continue; // income isn't spend
      const amount = effectiveAmount(tx);
      const isPersonal = (tx.pool || DEFAULT_POOL_NAME) === DEFAULT_POOL_NAME;
      if (isPersonal) {
        personal += amount;
        // effectiveSpendDay honors a transaction's effectiveDate override
        // (e.g. "spent yesterday, only logged today") over its real date.
        if (effectiveSpendDay(tx) === todayKey) daily += amount;
      } else {
        other += amount;
      }
    }
    return { personalTotal: personal, otherPoolsTotal: other, dailyTotal: daily };
  }, [transactions]);

  // A rough day-of-month average, not an actual daily allowance — just
  // enough context to tell "today was a big day" from "today was normal".
  const dailyBudget = monthlyBudget / 30;

  const budgetPct = Math.min(100, Math.round((personalTotal / monthlyBudget) * 100));
  const budgetColor =
    budgetPct >= 100 ? 'bg-red-500' : budgetPct >= 80 ? 'bg-amber-400' : 'bg-emerald-500';

  const remainingBudget = Math.max(0, monthlyBudget - personalTotal);
  // How many days (including today) are left in the current calendar
  // month — the remaining budget spread across just those, not the whole
  // month, so this tightens up as the month goes on rather than staying
  // a flat monthlyBudget/30 the whole time.
  const now = new Date();
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const daysRemainingInMonth = daysInMonth - now.getDate() + 1;
  const avgPerDayRemaining = remainingBudget / daysRemainingInMonth;

  function startEditingBudget() {
    setBudgetInput(String(monthlyBudget));
    setEditingBudget(true);
  }

  async function handleSaveBudget() {
    const value = parseFloat(budgetInput);
    if (Number.isNaN(value) || value < 0) return;
    setSavingBudget(true);
    try {
      await onUpdateBudget(value);
      setEditingBudget(false);
    } finally {
      setSavingBudget(false);
    }
  }

  if (loading) {
    return (
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <SummaryCardSkeleton />
        <SummaryCardSkeleton />
        {children}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {/* Today's Spend */}
      <div className="relative overflow-hidden rounded-2xl border border-white/5 bg-zinc-900/60 p-5">
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium uppercase tracking-wide text-zinc-400">
            Today's Spend
          </span>
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-sky-500/10 ring-1 ring-sky-500/25">
            <CalendarDays size={15} className="text-sky-400" />
          </div>
        </div>
        <div className="mt-3 text-2xl font-semibold tracking-tight text-zinc-50">
          {formatCurrency(dailyTotal)}
        </div>
        <p className="mt-2 text-xs text-zinc-500">
          {dailyTotal > dailyBudget
            ? `${formatCurrency(dailyTotal - dailyBudget)} over your ~${formatCurrency(dailyBudget)}/day average`
            : `vs. ~${formatCurrency(dailyBudget)}/day average (this month's budget ÷ 30)`}
        </p>
      </div>

      {/* Personal Spend + Monthly Budget, combined — the budget measures exactly this total. */}
      <div className="relative overflow-hidden rounded-2xl border border-emerald-500/20 bg-zinc-900/60 p-5 shadow-glow">
        <div className="pointer-events-none absolute -right-8 -top-8 h-28 w-28 rounded-full bg-emerald-500/10 blur-3xl" />
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium uppercase tracking-wide text-zinc-400">
            Personal Spend
          </span>
          <div className="flex items-center gap-1">
            {editingBudget ? (
              <>
                <button
                  onClick={handleSaveBudget}
                  disabled={savingBudget}
                  className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-500/15 text-emerald-400 ring-1 ring-emerald-500/25 hover:bg-emerald-500/25 disabled:opacity-50"
                  aria-label="Save monthly budget"
                >
                  <Check size={14} />
                </button>
                <button
                  onClick={() => setEditingBudget(false)}
                  disabled={savingBudget}
                  className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/5 text-zinc-400 ring-1 ring-white/10 hover:text-zinc-200"
                  aria-label="Cancel"
                >
                  <X size={14} />
                </button>
              </>
            ) : (
              <>
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-500/10 ring-1 ring-emerald-500/25">
                  <Wallet size={15} className="text-emerald-400" />
                </div>
                <button
                  onClick={startEditingBudget}
                  className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/5 text-zinc-300 ring-1 ring-white/10 hover:text-zinc-100"
                  aria-label="Edit monthly budget"
                >
                  <Target size={15} />
                </button>
              </>
            )}
          </div>
        </div>

        <div className="mt-3 text-2xl font-semibold tracking-tight text-zinc-50">
          {formatCurrency(personalTotal)}
        </div>
        <p className="mt-1 text-xs text-zinc-500">
          Excludes every other pool (Business, Savings, or your own splits) &amp; credits
          {otherPoolsTotal > 0 && (
            <span className="text-zinc-600"> · {formatCurrency(otherPoolsTotal)} counted elsewhere</span>
          )}
        </p>

        {editingBudget ? (
          <div className="mt-4">
            <div className="relative">
              <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-sm text-zinc-500">
                ₹
              </span>
              <input
                type="number"
                inputMode="decimal"
                min={0}
                autoFocus
                value={budgetInput}
                onChange={(e) => setBudgetInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleSaveBudget();
                  if (e.key === 'Escape') setEditingBudget(false);
                }}
                className="w-full rounded-xl border border-white/10 bg-white/5 py-2 pl-7 pr-3 text-sm text-zinc-100 outline-none focus:border-emerald-500/50 focus:ring-1 focus:ring-emerald-500/50"
              />
            </div>
            <Pencil size={11} className="mt-2 inline text-zinc-600" />
            <span className="ml-1 text-[11px] text-zinc-500">
              Only changes what this card measures against — your balance is untouched.
            </span>
          </div>
        ) : (
          <button
            type="button"
            onClick={onOpenSpendByDay}
            className="mt-4 block w-full text-left"
            aria-label="View personal spend by day"
          >
            <div className="flex items-baseline justify-between">
              <span className="inline-flex items-center gap-1 text-xs font-medium text-zinc-400 hover:text-zinc-300">
                <Receipt size={11} />
                Monthly budget
              </span>
              <span className="text-xs text-zinc-500">
                {budgetPct}% of {formatCurrency(monthlyBudget)}
              </span>
            </div>
            <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-white/5">
              <div
                className={`h-full rounded-full transition-all ${budgetColor}`}
                style={{ width: `${Math.min(100, (personalTotal / monthlyBudget) * 100)}%` }}
              />
            </div>
            <p className="mt-1.5 text-[11px] text-zinc-500">
              {formatCurrency(remainingBudget)} remaining this month
              <span className="text-zinc-600"> · ~{formatCurrency(avgPerDayRemaining)}/day for the rest of the month</span>
            </p>
          </button>
        )}
      </div>

      {children}
    </div>
  );
}
