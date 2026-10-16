import React, { useEffect, useState } from 'react';
import { X, PieChart } from 'lucide-react';
import { DEFAULT_POOL_NAME, Transaction } from '../types';
import { poolBadgeClass, poolDotClass } from '../constants';
import { formatCurrency } from '../utils/format';

interface AllocateModalProps {
  transaction: Transaction;
  /** The transaction's account's configured pools — whatever's left after excluding its own primary pool are the allocation targets. */
  pools: string[];
  onClose: () => void;
  onConfirm: (pool: string, amount: number) => void;
  submitting?: boolean;
}

export default function AllocateModal({ transaction, pools, onClose, onConfirm, submitting }: AllocateModalProps) {
  const primary = transaction.pool || DEFAULT_POOL_NAME;
  const otherPools = pools.filter((name) => name !== primary);

  const [pool, setPool] = useState<string>(transaction.allocationPool ?? otherPools[0] ?? primary);
  const [amount, setAmount] = useState<string>(
    transaction.allocationAmount != null ? String(transaction.allocationAmount) : ''
  );

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  const amountValue = parseFloat(amount);
  const isValid = !Number.isNaN(amountValue) && amountValue > 0 && amountValue < transaction.amount;
  const remainder = isValid ? transaction.amount - amountValue : transaction.amount;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="allocate-modal-title"
        className="relative w-full max-w-sm animate-fade-in rounded-2xl border border-white/10 bg-zinc-900 p-6 shadow-glow-lg"
      >
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-violet-500/10 ring-1 ring-violet-500/25">
              <PieChart size={16} className="text-violet-400" />
            </div>
            <div>
              <h3 id="allocate-modal-title" className="text-sm font-semibold text-zinc-100">
                Allocate across pools
              </h3>
              <p className="text-xs text-zinc-500">{transaction.merchant}</p>
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
          Total is <span className="font-medium text-zinc-200">{formatCurrency(transaction.amount)}</span>,
          currently all {primary}. Carve out a portion for another pool — the rest stays {primary}.
        </p>

        {otherPools.length === 0 ? (
          <p className="mt-4 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2.5 text-xs text-zinc-500">
            This account only has the {primary} pool — add another pool in Accounts to allocate across.
          </p>
        ) : (
          <>
            <div className="mt-4">
              <label className="mb-1.5 block text-xs font-medium text-zinc-400">Send a portion to</label>
              <div className="grid grid-cols-2 gap-1.5">
                {otherPools.map((name) => (
                  <button
                    key={name}
                    type="button"
                    onClick={() => setPool(name)}
                    className={`flex items-center justify-center gap-1.5 rounded-xl border px-2 py-2.5 text-xs font-medium transition-colors ${
                      pool === name
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
              <label className="mb-1.5 block text-xs font-medium text-zinc-400">Amount to {pool}</label>
              <div className="relative">
                <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-sm text-zinc-500">
                  ₹
                </span>
                <input
                  autoFocus
                  type="number"
                  inputMode="decimal"
                  min={0}
                  max={transaction.amount}
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="0"
                  className="w-full rounded-xl border border-white/10 bg-white/5 py-2.5 pl-7 pr-3 text-sm text-zinc-100 outline-none placeholder:text-zinc-600 focus:border-emerald-500/50 focus:ring-1 focus:ring-emerald-500/50"
                />
              </div>
              {!isValid && amount !== '' && (
                <p className="mt-1.5 text-xs text-red-400">Enter an amount between ₹1 and {formatCurrency(transaction.amount)}.</p>
              )}
              <p className="mt-1.5 text-xs text-zinc-500">
                {formatCurrency(remainder)} stays {primary}
              </p>
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
            disabled={!isValid || submitting || otherPools.length === 0}
            onClick={() => isValid && onConfirm(pool, amountValue)}
            className="rounded-xl bg-violet-500 px-4 py-2 text-sm font-medium text-violet-950 transition-colors hover:bg-violet-400 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {submitting ? 'Saving…' : 'Save allocation'}
          </button>
        </div>
      </div>
    </div>
  );
}
