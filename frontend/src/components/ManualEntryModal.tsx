import React, { useEffect, useState } from 'react';
import { AlertTriangle, Mail, PenLine, X } from 'lucide-react';
import { BankAccount, ManualExpenseInput } from '../types';
import ManualEntryForm from './ManualEntryForm';

interface ManualEntryModalProps {
  categories: string[];
  accounts: BankAccount[];
  onClose: () => void;
  onSubmit: (input: ManualExpenseInput) => Promise<void> | void;
  onAddCategory?: (name: string) => Promise<void> | void;
  /** Adds a Gmail sender address to an existing account — only offered in reportMode, where "sender wasn't configured" is the usual cause. */
  onAddAccountEmail?: (accountId: string, address: string) => Promise<void> | void;
  savingEmail?: boolean;
  submitting?: boolean;
  /** Switches to the "report a missing transaction" framing — same form, same endpoint. */
  reportMode?: boolean;
}

function AddSenderSection({
  accounts,
  onAdd,
  saving,
}: {
  accounts: BankAccount[];
  onAdd: (accountId: string, address: string) => Promise<void> | void;
  saving?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [address, setAddress] = useState('');
  // Neither built-in account (Cash, Deleted Accounts) has a real sender to attach — only real bank accounts are offered here.
  const realAccounts = accounts.filter((a) => !a.isDefault && !a.isArchive);
  const [accountId, setAccountId] = useState(realAccounts[0]?.id ?? '');

  if (realAccounts.length === 0) return null;

  const isValid = !!accountId && address.trim().length > 0;

  async function handleAdd() {
    if (!isValid) return;
    await onAdd(accountId, address.trim());
    setAddress('');
    setOpen(false);
  }

  return (
    <div className="mb-4 rounded-xl border border-amber-500/20 bg-amber-500/5 p-3">
      {open ? (
        <div className="space-y-2">
          <p className="text-xs font-medium text-amber-300">Missing because the sender isn't configured?</p>
          <select
            value={accountId}
            onChange={(e) => setAccountId(e.target.value)}
            className="w-full rounded-lg border border-white/10 bg-white/5 px-2.5 py-2 text-xs text-zinc-100 outline-none focus:border-emerald-500/50"
          >
            {realAccounts.map((a) => (
              <option key={a.id} value={a.id} className="bg-zinc-900 text-zinc-100">
                {a.bank}
              </option>
            ))}
          </select>
          <div className="flex items-center gap-1.5">
            <input
              type="email"
              autoFocus
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handleAdd();
                }
                if (e.key === 'Escape') {
                  // Stop it here — collapse just this sub-section (same
                  // as "Never mind"), not the whole modal underneath it.
                  e.stopPropagation();
                  setOpen(false);
                }
              }}
              placeholder="sender@bank.com"
              className="min-w-0 flex-1 rounded-lg border border-white/10 bg-white/5 px-2.5 py-2 text-xs text-zinc-100 outline-none placeholder:text-zinc-600 focus:border-emerald-500/50"
            />
            <button
              type="button"
              onClick={handleAdd}
              disabled={!isValid || saving}
              className="shrink-0 rounded-lg bg-amber-500/15 px-3 py-2 text-xs font-medium text-amber-300 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {saving ? 'Adding…' : 'Add'}
            </button>
          </div>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="text-[11px] font-medium text-zinc-500 hover:text-zinc-300"
          >
            Never mind
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="flex w-full items-center gap-2 text-left text-xs font-medium text-amber-300 hover:text-amber-200"
        >
          <Mail size={13} className="shrink-0" />
          Missing because the sender isn't configured? Add a Gmail address
        </button>
      )}
    </div>
  );
}

export default function ManualEntryModal({
  categories,
  accounts,
  onClose,
  onSubmit,
  onAddCategory,
  onAddAccountEmail,
  savingEmail,
  submitting,
  reportMode,
}: ManualEntryModalProps) {
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  // Visible here (not just the header button's hover-only tooltip, which
  // touch devices never see) — the accounts mail sync actually covers, so
  // it's clear before reporting whether this is really a missing-sender
  // problem or something else.
  const mailConfiguredAccounts = accounts.filter((a) => a.emailAddresses.length > 0);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="manual-entry-modal-title"
        className="relative w-full max-w-md animate-fade-in rounded-2xl border border-white/10 bg-zinc-900 p-6 shadow-glow-lg"
      >
        <div className="mb-5 flex items-start justify-between">
          <div className="flex items-center gap-2.5">
            <div
              className={`flex h-9 w-9 items-center justify-center rounded-lg ring-1 ${
                reportMode ? 'bg-amber-500/10 ring-amber-500/25' : 'bg-emerald-500/10 ring-emerald-500/25'
              }`}
            >
              {reportMode ? (
                <AlertTriangle size={16} className="text-amber-400" />
              ) : (
                <PenLine size={16} className="text-emerald-400" />
              )}
            </div>
            <div>
              <h3 id="manual-entry-modal-title" className="text-sm font-semibold text-zinc-100">
                {reportMode ? 'Report a missing transaction' : 'Log a cash expense'}
              </h3>
              {reportMode && (
                <p className="mt-0.5 max-w-[260px] text-xs text-zinc-500">
                  Mail sync only ever catches{' '}
                  {mailConfiguredAccounts.length > 0
                    ? `accounts you've configured (${mailConfiguredAccounts.map((a) => a.bank).join(', ')})`
                    : "accounts you've configured — none yet"}
                  . Add the transaction it missed here.
                </p>
              )}
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

        {reportMode && onAddAccountEmail && (
          <AddSenderSection accounts={accounts} onAdd={onAddAccountEmail} saving={savingEmail} />
        )}

        <ManualEntryForm
          categories={categories}
          accounts={accounts}
          onSubmit={onSubmit}
          onAddCategory={onAddCategory}
          submitting={submitting}
          onCancel={onClose}
          submitLabel={reportMode ? 'Add missing transaction' : undefined}
        />
      </div>
    </div>
  );
}
