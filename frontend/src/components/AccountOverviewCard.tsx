import React from 'react';
import { Landmark, ShieldAlert, Settings, Wallet } from 'lucide-react';
import { BankAccount, Transaction, combinePools } from '../types';
import { poolBarClass, poolIconClass } from '../constants';
import { formatCurrency } from '../utils/format';

interface AccountOverviewCardProps {
  /** The account(s) currently in view — every configured account for the combined total, or one for a single-account filter. */
  accounts: BankAccount[];
  transactions: Transaction[];
  loading: boolean;
  onConfigure: () => void;
}

export default function AccountOverviewCard({ accounts, transactions, loading, onConfigure }: AccountOverviewCardProps) {
  if (loading) {
    return (
      <div className="animate-pulse rounded-2xl border border-white/5 bg-zinc-900/60 p-5">
        <div className="h-4 w-32 rounded bg-white/5" />
        <div className="mt-4 h-7 w-40 rounded bg-white/5" />
        <div className="mt-5 h-10 rounded bg-white/5" />
      </div>
    );
  }

  const isConfigured = accounts.some((a) => a.anchoredAt != null);

  if (!isConfigured) {
    return (
      <div className="flex flex-col justify-between rounded-2xl border border-dashed border-white/10 bg-zinc-900/40 p-5">
        <div>
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/5 ring-1 ring-white/10">
            <Landmark size={15} className="text-zinc-300" />
          </div>
          <p className="mt-3 text-sm font-medium text-zinc-200">Set up your account</p>
          <p className="mt-1 text-xs text-zinc-500">
            Add your starting balance and however many pools you want — Personal, Business,
            Savings, or your own split — to see them here.
          </p>
        </div>
        <button
          onClick={onConfigure}
          className="mt-4 inline-flex items-center justify-center gap-1.5 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-medium text-zinc-300 hover:bg-white/10"
        >
          <Settings size={13} />
          Configure
        </button>
      </div>
    );
  }

  const minBalance = accounts.reduce((sum, a) => sum + a.minBalance, 0);
  const { byPool, reserved, total } = combinePools(accounts, transactions);
  const pools = Object.entries(byPool).sort((a, b) => b[1] - a[1]);
  const denom = total || 1;
  const belowMinimum = minBalance > 0 && total < minBalance;
  const label = accounts.length > 1 ? 'Combined Balance' : `${accounts[0]?.bank ?? 'Account'} Balance`;

  // Segment widths, floored at 0 so a pool that's gone negative doesn't
  // eat into the bar — it still shows in the tiles below with its real
  // (negative) amount.
  const segments = pools.map(([name, amount]) => ({
    name,
    pct: Math.max(0, Math.round((amount / denom) * 100)),
  }));
  const reservedPct = Math.max(0, Math.round((reserved / denom) * 100));

  return (
    <div className="relative overflow-hidden rounded-2xl border border-white/5 bg-zinc-900/60 p-5">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium uppercase tracking-wide text-zinc-400">{label}</span>
        <button
          onClick={onConfigure}
          className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/5 text-zinc-400 ring-1 ring-white/10 hover:text-zinc-200"
          aria-label="Edit account setup"
        >
          <Landmark size={15} />
        </button>
      </div>

      <div className="mt-3 text-2xl font-semibold tracking-tight text-zinc-50">
        {formatCurrency(total)}
      </div>
      <p className="mt-1 text-[11px] text-zinc-500">Live — updates with every credit and debit</p>

      {belowMinimum && (
        <div className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-red-500/10 px-2 py-0.5 text-[11px] font-medium text-red-300 ring-1 ring-inset ring-red-500/25">
          <ShieldAlert size={11} />
          Below your {formatCurrency(minBalance)} minimum
        </div>
      )}

      <div className="mt-4 flex h-2 w-full overflow-hidden rounded-full bg-white/5">
        {segments.map(({ name, pct }) => (
          <div key={name} className={`h-full ${poolBarClass(name)}`} style={{ width: `${pct}%` }} />
        ))}
        {reserved > 0 && <div className="h-full bg-zinc-500" style={{ width: `${reservedPct}%` }} />}
      </div>

      <div
        className={`mt-4 grid grid-cols-2 gap-2 text-[11px] ${
          pools.length + (reserved > 0 ? 1 : 0) >= 4 ? 'sm:grid-cols-4' : 'sm:grid-cols-3'
        }`}
      >
        {pools.map(([name, amount]) => (
          <div key={name} className="flex items-center gap-1.5">
            <Wallet size={12} className={poolIconClass(name)} />
            <div>
              <div className="text-zinc-300">{formatCurrency(amount)}</div>
              <div className="text-zinc-500">{name}</div>
            </div>
          </div>
        ))}
        {reserved > 0 && (
          <div className="flex items-center gap-1.5">
            <ShieldAlert size={12} className="text-zinc-400" />
            <div>
              <div className="text-zinc-300">{formatCurrency(reserved)}</div>
              <div className="text-zinc-500">Reserved</div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
