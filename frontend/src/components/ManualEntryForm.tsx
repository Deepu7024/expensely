import React, { useEffect, useMemo, useState } from 'react';
import { ArrowDownLeft, ArrowUpRight, Banknote, Landmark, Plus } from 'lucide-react';
import { BankAccount, DEFAULT_POOL_NAME, ManualExpenseInput, TransactionType } from '../types';
import { poolBadgeClass, poolDotClass } from '../constants';

interface ManualEntryFormProps {
  categories: string[];
  accounts: BankAccount[];
  onSubmit: (input: ManualExpenseInput) => Promise<void> | void;
  onAddCategory?: (name: string) => Promise<void> | void;
  submitting?: boolean;
  onCancel?: () => void;
  /** Changes the submit button copy for the "report a missed transaction" flow — same form, same endpoint. */
  submitLabel?: string;
}

export default function ManualEntryForm({
  categories,
  accounts,
  onSubmit,
  onAddCategory,
  submitting,
  onCancel,
  submitLabel,
}: ManualEntryFormProps) {
  const defaultAccount = accounts.find((a) => a.isDefault) ?? accounts[0];

  const [amount, setAmount] = useState('');
  const [merchant, setMerchant] = useState('');
  const [category, setCategory] = useState(categories[0] ?? 'Other');
  const [addingCategory, setAddingCategory] = useState(false);
  const [newCategory, setNewCategory] = useState('');
  const [isCashEntry, setIsCashEntry] = useState(true);
  const [pool, setPool] = useState<string>(DEFAULT_POOL_NAME);
  const [type, setType] = useState<TransactionType>('Debit');
  const [accountId, setAccountId] = useState(defaultAccount?.id ?? '');

  const selectedAccount = accounts.find((a) => a.id === accountId);
  const poolNames = useMemo(
    () => (selectedAccount ? selectedAccount.pools.map((p) => p.name) : [DEFAULT_POOL_NAME]),
    [selectedAccount]
  );

  // Switching accounts can change which pools are available — fall back to
  // Personal (always present) if the currently-picked one doesn't exist
  // on the newly-selected account.
  useEffect(() => {
    if (!poolNames.includes(pool)) setPool(DEFAULT_POOL_NAME);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accountId]);

  const amountValue = parseFloat(amount);
  const isValid = merchant.trim().length > 0 && !Number.isNaN(amountValue) && amountValue > 0 && !!accountId;
  // Only reachable if fetching bank accounts failed while something else
  // (e.g. expenses) succeeded — otherwise there's always at least the
  // built-in Cash account. Without this, the account <select> renders
  // with zero options and the form is stuck disabled with no explanation.
  const noAccounts = accounts.length === 0;

  async function handleConfirmNewCategory() {
    const name = newCategory.trim();
    if (!name) return;
    if (onAddCategory) await onAddCategory(name);
    setCategory(name);
    setNewCategory('');
    setAddingCategory(false);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!isValid) return;
    await onSubmit({
      merchant: merchant.trim(),
      amount: amountValue,
      category,
      isCashEntry,
      pool,
      type,
      accountId,
    });
    setAmount('');
    setMerchant('');
    setCategory(categories[0] ?? 'Other');
    setIsCashEntry(true);
    setPool(DEFAULT_POOL_NAME);
    setType('Debit');
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {noAccounts && (
        <div className="rounded-xl border border-amber-500/25 bg-amber-500/10 px-3 py-2.5 text-xs text-amber-300">
          Couldn't load your bank accounts, so there's nothing to log this against yet — try
          refreshing the page.
        </div>
      )}

      <div>
        <label className="mb-1.5 block text-xs font-medium text-zinc-400">Amount</label>
        <div className="relative">
          <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-sm text-zinc-500">
            ₹
          </span>
          <input
            type="number"
            inputMode="decimal"
            min={0}
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0.00"
            className="w-full rounded-xl border border-white/10 bg-white/5 py-2.5 pl-7 pr-3 text-sm text-zinc-100 outline-none placeholder:text-zinc-600 focus:border-emerald-500/50 focus:ring-1 focus:ring-emerald-500/50"
          />
        </div>
      </div>

      <div>
        <label className="mb-1.5 block text-xs font-medium text-zinc-400">Merchant name</label>
        <input
          type="text"
          value={merchant}
          onChange={(e) => setMerchant(e.target.value)}
          placeholder="e.g. Corner Store"
          className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 text-sm text-zinc-100 outline-none placeholder:text-zinc-600 focus:border-emerald-500/50 focus:ring-1 focus:ring-emerald-500/50"
        />
      </div>

      <div>
        <label className="mb-1.5 block text-xs font-medium text-zinc-400">Debit or credit</label>
        <div className="grid grid-cols-2 gap-1.5">
          <button
            type="button"
            onClick={() => setType('Debit')}
            className={`flex items-center justify-center gap-1.5 rounded-xl border px-2 py-2.5 text-xs font-medium transition-colors ${
              type === 'Debit'
                ? 'border-transparent bg-zinc-500/15 text-zinc-200 ring-1 ring-inset ring-zinc-500/30'
                : 'border-white/10 bg-white/5 text-zinc-400 hover:bg-white/10'
            }`}
          >
            <ArrowUpRight size={14} />
            Debit
          </button>
          <button
            type="button"
            onClick={() => setType('Credit')}
            className={`flex items-center justify-center gap-1.5 rounded-xl border px-2 py-2.5 text-xs font-medium transition-colors ${
              type === 'Credit'
                ? 'border-transparent bg-emerald-500/15 text-emerald-300 ring-1 ring-inset ring-emerald-500/30'
                : 'border-white/10 bg-white/5 text-zinc-400 hover:bg-white/10'
            }`}
          >
            <ArrowDownLeft size={14} />
            Credit
          </button>
        </div>
      </div>

      <div>
        <label className="mb-1.5 block text-xs font-medium text-zinc-400">Bank account</label>
        <div className="relative">
          <Landmark size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
          <select
            value={accountId}
            onChange={(e) => setAccountId(e.target.value)}
            className="w-full rounded-xl border border-white/10 bg-white/5 py-2.5 pl-9 pr-3 text-sm text-zinc-100 outline-none focus:border-emerald-500/50 focus:ring-1 focus:ring-emerald-500/50"
          >
            {accounts.map((a) => (
              <option key={a.id} value={a.id} className="bg-zinc-900 text-zinc-100">
                {a.bank}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div>
        <label className="mb-1.5 block text-xs font-medium text-zinc-400">Category</label>
        {addingCategory ? (
          <div className="flex items-center gap-1.5">
            <input
              autoFocus
              value={newCategory}
              onChange={(e) => setNewCategory(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handleConfirmNewCategory();
                }
                if (e.key === 'Escape') {
                  // Stop it here — otherwise this bubbles up to the modal's
                  // own Escape-to-close handler and discards the whole
                  // form, not just this inline field.
                  e.stopPropagation();
                  setAddingCategory(false);
                }
              }}
              placeholder="New category name"
              maxLength={40}
              className="min-w-0 flex-1 rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 text-sm text-zinc-100 outline-none placeholder:text-zinc-600 focus:border-emerald-500/50 focus:ring-1 focus:ring-emerald-500/50"
            />
            <button
              type="button"
              onClick={handleConfirmNewCategory}
              disabled={!newCategory.trim()}
              className="shrink-0 rounded-xl bg-emerald-500/15 px-3 py-2.5 text-xs font-medium text-emerald-300 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Add
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-1.5">
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="min-w-0 flex-1 rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 text-sm text-zinc-100 outline-none focus:border-emerald-500/50 focus:ring-1 focus:ring-emerald-500/50"
            >
              {categories.map((c) => (
                <option key={c} value={c} className="bg-zinc-900 text-zinc-100">
                  {c}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => setAddingCategory(true)}
              className="flex h-[42px] w-[42px] shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-zinc-400 hover:bg-white/10 hover:text-zinc-200"
              aria-label="Add a new category"
            >
              <Plus size={15} />
            </button>
          </div>
        )}
      </div>

      <div>
        <label className="mb-1.5 block text-xs font-medium text-zinc-400">Counts toward</label>
        <div className={`grid gap-1.5 ${poolNames.length <= 2 ? 'grid-cols-2' : 'grid-cols-3'}`}>
          {poolNames.map((name) => (
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

      <label className="flex items-center gap-2.5 rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 text-sm text-zinc-300">
        <input
          type="checkbox"
          checked={isCashEntry}
          onChange={(e) => setIsCashEntry(e.target.checked)}
          className="h-4 w-4 rounded border-white/20 bg-white/5 text-emerald-500 focus:ring-emerald-500/50"
        />
        <Banknote size={15} className="text-amber-400" />
        Is Cash Entry
      </label>

      <div className="flex justify-end gap-2 pt-2">
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="rounded-xl px-4 py-2.5 text-sm font-medium text-zinc-400 hover:bg-white/5 hover:text-zinc-200"
          >
            Cancel
          </button>
        )}
        <button
          type="submit"
          disabled={!isValid || submitting}
          className="rounded-xl bg-emerald-500 px-4 py-2.5 text-sm font-medium text-emerald-950 transition-colors hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {submitting ? 'Saving…' : submitLabel ?? 'Add expense'}
        </button>
      </div>
    </form>
  );
}
