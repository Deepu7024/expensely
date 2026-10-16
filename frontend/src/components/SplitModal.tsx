import React, { useEffect, useState } from 'react';
import { X, SplitSquareHorizontal } from 'lucide-react';
import { Transaction } from '../types';
import { formatCurrency } from '../utils/format';

interface SplitModalProps {
  transaction: Transaction;
  onClose: () => void;
  onConfirm: (shareAmount: number) => void;
  submitting?: boolean;
}

export default function SplitModal({ transaction, onClose, onConfirm, submitting }: SplitModalProps) {
  const [share, setShare] = useState<string>(
    transaction.shareAmount != null ? String(transaction.shareAmount) : ''
  );

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  const shareValue = parseFloat(share);
  const isValid = !Number.isNaN(shareValue) && shareValue > 0 && shareValue <= transaction.amount;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="split-modal-title"
        className="relative w-full max-w-sm animate-fade-in rounded-2xl border border-white/10 bg-zinc-900 p-6 shadow-glow-lg"
      >
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-500/10 ring-1 ring-emerald-500/25">
              <SplitSquareHorizontal size={16} className="text-emerald-400" />
            </div>
            <div>
              <h3 id="split-modal-title" className="text-sm font-semibold text-zinc-100">
                Split expense
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
          Total was <span className="font-medium text-zinc-200">{formatCurrency(transaction.amount)}</span>.
          What was your share?
        </p>

        <div className="mt-3 relative">
          <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-sm text-zinc-500">
            ₹
          </span>
          <input
            autoFocus
            type="number"
            inputMode="decimal"
            min={0}
            max={transaction.amount}
            value={share}
            onChange={(e) => setShare(e.target.value)}
            placeholder="0"
            className="w-full rounded-xl border border-white/10 bg-white/5 py-2.5 pl-7 pr-3 text-sm text-zinc-100 outline-none placeholder:text-zinc-600 focus:border-emerald-500/50 focus:ring-1 focus:ring-emerald-500/50"
          />
        </div>
        {!isValid && share !== '' && (
          <p className="mt-1.5 text-xs text-red-400">Enter an amount between ₹1 and {formatCurrency(transaction.amount)}.</p>
        )}

        <div className="mt-5 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="rounded-xl px-4 py-2 text-sm font-medium text-zinc-400 hover:bg-white/5 hover:text-zinc-200"
          >
            Cancel
          </button>
          <button
            disabled={!isValid || submitting}
            onClick={() => isValid && onConfirm(shareValue)}
            className="rounded-xl bg-emerald-500 px-4 py-2 text-sm font-medium text-emerald-950 transition-colors hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {submitting ? 'Saving…' : 'Save split'}
          </button>
        </div>
      </div>
    </div>
  );
}
