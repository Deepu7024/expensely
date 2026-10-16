import React, { useEffect, useMemo } from 'react';
import { ArrowDownLeft, ArrowUpRight, History, ShieldAlert, Wallet, X } from 'lucide-react';
import { BankAccount, Transaction, computeAccountSnapshotAfter } from '../types';
import { poolIconClass } from '../constants';
import { formatCurrency, formatDateTime } from '../utils/format';

interface AccountSnapshotModalProps {
  transaction: Transaction;
  account: BankAccount;
  transactions: Transaction[];
  onClose: () => void;
}

export default function AccountSnapshotModal({
  transaction,
  account,
  transactions,
  onClose,
}: AccountSnapshotModalProps) {
  const snapshot = useMemo(
    () => computeAccountSnapshotAfter(account, transactions, transaction.id),
    [account, transactions, transaction.id]
  );

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  const poolEntries = snapshot ? Object.entries(snapshot.byPool) : [];
  const isCredit = transaction.type === 'Credit';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="account-snapshot-title"
        className="relative w-full max-w-md animate-fade-in rounded-2xl border border-white/10 bg-zinc-900 p-6 shadow-glow-lg"
      >
        <div className="flex items-start justify-between gap-4">
          <div className="flex min-w-0 items-center gap-2.5">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-emerald-500/10 ring-1 ring-emerald-500/25">
              <History size={16} className="text-emerald-400" />
            </div>
            <div className="min-w-0">
              <h3 id="account-snapshot-title" className="text-sm font-semibold text-zinc-100">
                Account after transaction
              </h3>
              <p className="truncate text-xs text-zinc-500">
                {account.bank} · {formatDateTime(transaction.date)}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="Close account snapshot"
            className="rounded-lg p-1 text-zinc-500 hover:bg-white/5 hover:text-zinc-300"
          >
            <X size={16} />
          </button>
        </div>

        <div className="mt-5 flex items-center justify-between rounded-xl border border-white/5 bg-white/[0.03] p-3">
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-zinc-200">{transaction.merchant}</p>
            <p className="mt-0.5 text-[11px] text-zinc-500">{transaction.category} · {transaction.pool}</p>
          </div>
          <div className={`ml-3 flex items-center gap-1 text-sm font-semibold ${isCredit ? 'text-emerald-400' : 'text-zinc-200'}`}>
            {isCredit ? <ArrowDownLeft size={14} /> : <ArrowUpRight size={14} />}
            {isCredit ? '+' : '−'}{formatCurrency(transaction.amount)}
          </div>
        </div>

        {snapshot ? (
          <>
            <div className="mt-5">
              <p className="text-[10px] font-medium uppercase tracking-wider text-zinc-500">Balance after</p>
              <p className="mt-1 text-3xl font-semibold tracking-tight text-zinc-50">
                {formatCurrency(snapshot.total)}
              </p>
            </div>

            <div className="mt-5 grid grid-cols-2 gap-2">
              {poolEntries.map(([name, amount]) => (
                <div key={name} className="rounded-xl border border-white/5 bg-white/[0.03] p-3">
                  <div className="flex items-center gap-1.5 text-xs text-zinc-500">
                    <Wallet size={12} className={poolIconClass(name)} />
                    {name}
                  </div>
                  <p className={`mt-1.5 text-sm font-medium ${amount < 0 ? 'text-red-300' : 'text-zinc-200'}`}>
                    {formatCurrency(amount)}
                  </p>
                </div>
              ))}
              {snapshot.reserved > 0 && (
                <div className="rounded-xl border border-white/5 bg-white/[0.03] p-3">
                  <div className="flex items-center gap-1.5 text-xs text-zinc-500">
                    <ShieldAlert size={12} className="text-zinc-400" />
                    Reserved
                  </div>
                  <p className="mt-1.5 text-sm font-medium text-zinc-200">
                    {formatCurrency(snapshot.reserved)}
                  </p>
                </div>
              )}
            </div>

            <p className="mt-4 text-[11px] leading-relaxed text-zinc-600">
              Reconstructed from the account balance and pool split saved on{' '}
              {account.anchoredAt ? formatDateTime(account.anchoredAt) : 'setup'}, including every transaction through this one.
            </p>
          </>
        ) : (
          <div className="mt-5 rounded-xl border border-amber-500/20 bg-amber-500/5 p-4 text-sm text-amber-200">
            A reliable snapshot is unavailable because this transaction predates the account’s current starting-balance anchor.
          </div>
        )}
      </div>
    </div>
  );
}
