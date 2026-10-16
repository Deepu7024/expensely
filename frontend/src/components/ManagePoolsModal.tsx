import React, { useEffect, useMemo, useState } from 'react';
import { Plus, SlidersHorizontal, Trash2, X } from 'lucide-react';
import { BankAccount, DEFAULT_POOL_NAME } from '../types';
import { poolDotClass } from '../constants';

const preciseCurrency = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export type ManagedPoolValue = { name: string; amount: number };

interface ManagePoolsModalProps {
  account: BankAccount;
  poolAmounts: Record<string, number>;
  onClose: () => void;
  onConfirm: (pools: ManagedPoolValue[]) => void;
  submitting?: boolean;
}

type Draft = { key: string; name: string; amount: string; isDefault: boolean };

export default function ManagePoolsModal({
  account,
  poolAmounts,
  onClose,
  onConfirm,
  submitting,
}: ManagePoolsModalProps) {
  const [rows, setRows] = useState<Draft[]>(() =>
    account.pools.map((pool) => ({
      key: pool.id,
      name: pool.name,
      amount: String(poolAmounts[pool.name] ?? 0),
      isDefault: pool.isDefault,
    }))
  );

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  const targetTotal = Object.values(poolAmounts).reduce((sum, amount) => sum + amount, 0);
  const parsed = useMemo(
    () => rows.map((row) => ({ ...row, numericAmount: parseFloat(row.amount) })),
    [rows]
  );
  const allocated = parsed.reduce(
    (sum, row) => sum + (Number.isNaN(row.numericAmount) ? 0 : row.numericAmount),
    0
  );
  const remaining = targetTotal - allocated;
  const cleanNames = rows.map((row) => row.name.trim());
  const namesValid =
    cleanNames.every(Boolean) && new Set(cleanNames.map((name) => name.toLowerCase())).size === rows.length;
  const amountsValid = parsed.every((row) => !Number.isNaN(row.numericAmount) && row.numericAmount >= 0);
  const isBalanced = Math.abs(remaining) <= 0.01;
  const isValid = namesValid && amountsValid && isBalanced && cleanNames.includes(DEFAULT_POOL_NAME);

  function updateRow(key: string, patch: Partial<Draft>) {
    setRows((current) => current.map((row) => (row.key === key ? { ...row, ...patch } : row)));
  }

  function removeRow(key: string) {
    setRows((current) => current.filter((row) => row.key !== key));
  }

  function addRow() {
    setRows((current) => [
      ...current,
      { key: `new-${Date.now()}-${current.length}`, name: '', amount: '0', isDefault: false },
    ]);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="manage-pools-modal-title"
        className="relative w-full max-w-lg animate-fade-in rounded-2xl border border-white/10 bg-zinc-900 p-6 shadow-glow-lg"
      >
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-500/10 ring-1 ring-emerald-500/25">
              <SlidersHorizontal size={16} className="text-emerald-400" />
            </div>
            <div>
              <h3 id="manage-pools-modal-title" className="text-sm font-semibold text-zinc-100">Manage pools</h3>
              <p className="text-xs text-zinc-500">{account.bank} · {preciseCurrency.format(targetTotal)} to allocate</p>
            </div>
          </div>
          <button onClick={onClose} aria-label="Close manage pools" className="rounded-lg p-1 text-zinc-500 hover:bg-white/5 hover:text-zinc-300">
            <X size={16} />
          </button>
        </div>

        <p className="mt-4 text-sm text-zinc-400">
          Enter what every pool should contain now. You can fund a new pool from one or several existing pools; transactions and the bank balance stay unchanged.
        </p>

        <div className="mt-4 space-y-2">
          {rows.map((row) => (
            <div key={row.key} className="flex items-center gap-2">
              <span className={`h-2 w-2 shrink-0 rounded-full ${poolDotClass(row.name || 'pool')}`} />
              <input
                value={row.name}
                disabled={row.isDefault}
                onChange={(e) => updateRow(row.key, { name: e.target.value })}
                placeholder="Pool name"
                maxLength={40}
                className="min-w-0 flex-1 rounded-lg border border-white/10 bg-white/5 px-2.5 py-2 text-sm text-zinc-100 outline-none placeholder:text-zinc-600 focus:border-emerald-500/50 disabled:opacity-70"
              />
              <div className="relative w-32 shrink-0">
                <span className="pointer-events-none absolute inset-y-0 left-2.5 flex items-center text-xs text-zinc-500">₹</span>
                <input
                  type="number"
                  inputMode="decimal"
                  min={0}
                  step="0.01"
                  value={row.amount}
                  onChange={(e) => updateRow(row.key, { amount: e.target.value })}
                  className="w-full rounded-lg border border-white/10 bg-white/5 py-2 pl-6 pr-2 text-sm text-zinc-100 outline-none focus:border-emerald-500/50"
                />
              </div>
              {!row.isDefault && (
                <button
                  type="button"
                  onClick={() => removeRow(row.key)}
                  aria-label={`Remove ${row.name || 'pool'}`}
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/5 text-zinc-400 ring-1 ring-white/10 hover:bg-red-500/10 hover:text-red-400"
                >
                  <Trash2 size={13} />
                </button>
              )}
            </div>
          ))}
        </div>

        <button type="button" onClick={addRow} className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-emerald-400 hover:text-emerald-300">
          <Plus size={12} /> Add pool
        </button>

        <div className={`mt-4 rounded-xl border px-3 py-2.5 text-xs ${
          isBalanced
            ? 'border-emerald-500/20 bg-emerald-500/5 text-emerald-300'
            : 'border-amber-500/20 bg-amber-500/5 text-amber-300'
        }`}>
          <div className="flex items-center justify-between">
            <span>Allocated</span>
            <span>{preciseCurrency.format(allocated)} / {preciseCurrency.format(targetTotal)}</span>
          </div>
          {!isBalanced && (
            <p className="mt-1">
              {remaining > 0
                ? `${preciseCurrency.format(remaining)} still needs to be allocated.`
                : `Reduce allocations by ${preciseCurrency.format(Math.abs(remaining))}.`}
            </p>
          )}
          {!namesValid && <p className="mt-1">Every pool needs a unique name.</p>}
        </div>

        <p className="mt-3 text-[11px] leading-relaxed text-zinc-600">
          Removing a row archives that pool after its value has been distributed. Historical transactions keep their original pool label.
        </p>

        <div className="mt-5 flex justify-end gap-2">
          <button onClick={onClose} className="rounded-xl px-4 py-2 text-sm font-medium text-zinc-400 hover:bg-white/5 hover:text-zinc-200">Cancel</button>
          <button
            disabled={!isValid || submitting}
            onClick={() => isValid && onConfirm(parsed.map((row) => ({ name: row.name.trim(), amount: row.numericAmount })))}
            className="rounded-xl bg-emerald-500 px-4 py-2 text-sm font-medium text-emerald-950 hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {submitting ? 'Saving…' : 'Save allocation'}
          </button>
        </div>
      </div>
    </div>
  );
}
