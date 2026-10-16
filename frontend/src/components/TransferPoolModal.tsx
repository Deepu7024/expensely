import React, { useEffect, useState } from 'react';
import { ArrowRightLeft, X } from 'lucide-react';
import { BankAccount } from '../types';
import { poolBadgeClass, poolDotClass } from '../constants';
import { formatCurrency } from '../utils/format';

// formatCurrency rounds to whole rupees for display — fine everywhere else,
// but here it can show "₹3,214" for a pool whose real available amount is
// 3213.50, and the transfer cap enforces that exact (unrounded) number.
// Typing back the rounded figure would then fail by paise, so anywhere
// "available" is shown as a hard limit, show the precise amount instead.
const preciseCurrency = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

interface TransferPoolModalProps {
  account: BankAccount;
  /** Each pool's current live amount (see computePools) — caps how much can move out of it. */
  poolAmounts: Record<string, number>;
  onClose: () => void;
  onConfirm: (fromPool: string, toPool: string, amount: number) => void;
  submitting?: boolean;
}

export default function TransferPoolModal({ account, poolAmounts, onClose, onConfirm, submitting }: TransferPoolModalProps) {
  const poolNames = account.pools.map((p) => p.name);

  const [fromPool, setFromPool] = useState(poolNames[0] ?? '');
  const [toPool, setToPool] = useState(poolNames[1] ?? poolNames[0] ?? '');
  const [amount, setAmount] = useState('');

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  const available = poolAmounts[fromPool] ?? 0;
  const amountValue = parseFloat(amount);
  const isValid = fromPool !== toPool && !Number.isNaN(amountValue) && amountValue > 0 && amountValue <= available;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="transfer-pool-modal-title"
        className="relative w-full max-w-sm animate-fade-in rounded-2xl border border-white/10 bg-zinc-900 p-6 shadow-glow-lg"
      >
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-violet-500/10 ring-1 ring-violet-500/25">
              <ArrowRightLeft size={16} className="text-violet-400" />
            </div>
            <div>
              <h3 id="transfer-pool-modal-title" className="text-sm font-semibold text-zinc-100">
                Transfer between pools
              </h3>
              <p className="text-xs text-zinc-500">{account.bank}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="rounded-lg p-1 text-zinc-500 hover:bg-white/5 hover:text-zinc-300"
          >
            <X size={16} />
          </button>
        </div>

        <p className="mt-4 text-sm text-zinc-400">
          Move money from one of this account's pools to another — nothing actually leaves the
          account, it just re-labels which pool it belongs to.
        </p>

        {poolNames.length < 2 ? (
          <p className="mt-4 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2.5 text-xs text-zinc-500">
            This account only has one pool — add another pool in Accounts to transfer between.
          </p>
        ) : (
          <>
            <div className="mt-4">
              <label className="mb-1.5 block text-xs font-medium text-zinc-400">From</label>
              <div className="grid grid-cols-2 gap-1.5">
                {poolNames.map((name) => (
                  <button
                    key={name}
                    type="button"
                    onClick={() => {
                      setFromPool(name);
                      if (name === toPool) setToPool(poolNames.find((n) => n !== name) ?? name);
                    }}
                    className={`flex flex-col items-center justify-center gap-0.5 rounded-xl border px-2 py-2 text-xs font-medium transition-colors ${
                      fromPool === name
                        ? `border-transparent ring-1 ring-inset ${poolBadgeClass(name)}`
                        : 'border-white/10 bg-white/5 text-zinc-400 hover:bg-white/10'
                    }`}
                  >
                    <span className="flex items-center gap-1.5">
                      <span className={`h-1.5 w-1.5 rounded-full ${poolDotClass(name)}`} />
                      {name}
                    </span>
                    <span className="text-[10px] opacity-75">{preciseCurrency.format(poolAmounts[name] ?? 0)} available</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="mt-4">
              <label className="mb-1.5 block text-xs font-medium text-zinc-400">To</label>
              <div className="grid grid-cols-2 gap-1.5">
                {poolNames
                  .filter((name) => name !== fromPool)
                  .map((name) => (
                    <button
                      key={name}
                      type="button"
                      onClick={() => setToPool(name)}
                      className={`flex items-center justify-center gap-1.5 rounded-xl border px-2 py-2.5 text-xs font-medium transition-colors ${
                        toPool === name
                          ? `border-transparent ring-1 ring-inset ${poolBadgeClass(name)}`
                          : 'border-white/10 bg-white/5 text-zinc-400 hover:bg-white/10'
                      }`}
                    >
                      <span className={`h-1.5 w-1.5 rounded-full ${poolDotClass(name)}`} />
                      {name}
                    </button>
                  ))}
              </div>
            </div>

            <div className="mt-4">
              <div className="mb-1.5 flex items-center justify-between">
                <label className="text-xs font-medium text-zinc-400">
                  Amount to move ({preciseCurrency.format(Math.max(0, available))} available in {fromPool})
                </label>
                {available > 0 && (
                  <button
                    type="button"
                    onClick={() => setAmount(String(available))}
                    className="text-[11px] font-medium text-emerald-400 hover:text-emerald-300"
                  >
                    Max
                  </button>
                )}
              </div>
              <div className="relative">
                <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-sm text-zinc-500">
                  ₹
                </span>
                <input
                  autoFocus
                  type="number"
                  inputMode="decimal"
                  min={0}
                  max={Math.max(0, available)}
                  step="0.01"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="0"
                  className="w-full rounded-xl border border-white/10 bg-white/5 py-2.5 pl-7 pr-3 text-sm text-zinc-100 outline-none placeholder:text-zinc-600 focus:border-emerald-500/50 focus:ring-1 focus:ring-emerald-500/50"
                />
              </div>
              {amount !== '' && !Number.isNaN(amountValue) && amountValue > 0 && amountValue > available && (
                <p className="mt-1.5 text-xs text-red-400">
                  Only {preciseCurrency.format(available)} is available in {fromPool}.
                </p>
              )}
              {amount !== '' && (Number.isNaN(amountValue) || amountValue <= 0) && (
                <p className="mt-1.5 text-xs text-red-400">Enter an amount greater than ₹0.</p>
              )}
              {isValid && (
                <p className="mt-1.5 text-xs text-zinc-500">
                  {formatCurrency(amountValue)} moves from {fromPool} to {toPool}
                </p>
              )}
            </div>
          </>
        )}

        <div className="mt-5 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="rounded-xl px-4 py-2 text-sm font-medium text-zinc-400 hover:bg-white/5 hover:text-zinc-200"
          >
            Cancel
          </button>
          <button
            disabled={!isValid || submitting || poolNames.length < 2}
            onClick={() => isValid && onConfirm(fromPool, toPool, amountValue)}
            className="rounded-xl bg-violet-500 px-4 py-2 text-sm font-medium text-violet-950 transition-colors hover:bg-violet-400 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {submitting ? 'Transferring…' : 'Transfer'}
          </button>
        </div>
      </div>
    </div>
  );
}
