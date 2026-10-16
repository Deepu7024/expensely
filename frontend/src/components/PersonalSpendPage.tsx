import React, { useEffect, useState } from 'react';
import { Check, ChevronDown, MessageSquarePlus, Pencil, X } from 'lucide-react';
import { fetchPersonalSpendByDay, updateDayNote, updateExpense } from '../api';
import { PersonalSpendDay, Transaction, effectiveAmount } from '../types';
import { formatCurrency, formatDate } from '../utils/format';

interface PersonalSpendPageProps {
  /** Scopes to a single account, matching the dashboard's account filter set to one; omit for every non-archived account combined ("All accounts"). */
  accountId?: string;
}

/** Shared inline "click to reveal a text field" note editor — used for both a day's note and one transaction's note. */
function NoteEditor({
  value,
  placeholder,
  addLabel,
  onSave,
}: {
  value?: string;
  placeholder: string;
  addLabel: string;
  onSave: (note: string) => Promise<void> | void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value ?? '');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!editing) setDraft(value ?? '');
  }, [value, editing]);

  async function handleSave() {
    setSaving(true);
    try {
      await onSave(draft.trim());
      setEditing(false);
    } finally {
      setSaving(false);
    }
  }

  function cancel() {
    setEditing(false);
    setDraft(value ?? '');
  }

  if (editing) {
    return (
      <div className="mt-1.5 flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
        <input
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleSave();
            if (e.key === 'Escape') {
              e.stopPropagation();
              cancel();
            }
          }}
          placeholder={placeholder}
          maxLength={200}
          className="min-w-0 flex-1 rounded-lg border border-white/10 bg-white/5 px-2 py-1 text-xs text-zinc-100 outline-none placeholder:text-zinc-600 focus:border-emerald-500/50"
        />
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          aria-label="Save note"
          className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-emerald-500/15 text-emerald-400 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <Check size={12} />
        </button>
        <button
          type="button"
          onClick={cancel}
          aria-label="Cancel"
          className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-white/5 text-zinc-400 hover:text-zinc-200"
        >
          <X size={12} />
        </button>
      </div>
    );
  }

  if (value) {
    return (
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setEditing(true);
        }}
        className="mt-1.5 flex items-start gap-1.5 text-left text-[11px] text-zinc-500 hover:text-zinc-300"
      >
        <Pencil size={10} className="mt-0.5 shrink-0" />
        <span className="italic">{value}</span>
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        setEditing(true);
      }}
      className="mt-1.5 inline-flex items-center gap-1 text-[11px] font-medium text-zinc-600 hover:text-zinc-400"
    >
      <MessageSquarePlus size={11} />
      {addLabel}
    </button>
  );
}

function TransactionRow({
  tx,
  onSaveNote,
}: {
  tx: Transaction;
  onSaveNote: (note: string) => Promise<void> | void;
}) {
  return (
    <div className="rounded-lg px-2.5 py-1.5">
      <div className="flex items-center justify-between gap-3 text-xs">
        <span className="min-w-0 truncate text-zinc-300">{tx.merchant}</span>
        <span className="shrink-0 text-zinc-400">{formatCurrency(effectiveAmount(tx))}</span>
      </div>
      {/* Counted toward this day by an effectiveDate override rather than its own date — flag it so it isn't mistaken for actually happening on this day. */}
      {tx.effectiveDate && (
        <p className="mt-0.5 text-[10px] text-zinc-600">logged {formatDate(tx.date)}</p>
      )}
      <NoteEditor value={tx.note} placeholder="Add a note…" addLabel="Add a note" onSave={onSaveNote} />
    </div>
  );
}

export default function PersonalSpendPage({ accountId }: PersonalSpendPageProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [total, setTotal] = useState(0);
  const [days, setDays] = useState<PersonalSpendDay[]>([]);
  // Independent dropdowns — more than one day can be open at once, not a
  // single-open accordion.
  const [openDays, setOpenDays] = useState<Set<string>>(new Set());

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetchPersonalSpendByDay(accountId)
      .then((data) => {
        if (cancelled) return;
        setTotal(data.total);
        setDays(data.days);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Could not load spend by day.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [accountId]);

  function toggleDay(date: string) {
    setOpenDays((prev) => {
      const next = new Set(prev);
      if (next.has(date)) next.delete(date);
      else next.add(date);
      return next;
    });
  }

  async function handleSaveDayNote(date: string, note: string) {
    const saved = await updateDayNote(date, note);
    setDays((prev) => prev.map((d) => (d.date === date ? { ...d, note: saved.note ?? undefined } : d)));
  }

  async function handleSaveTransactionNote(dayDate: string, txId: string, note: string) {
    const saved = await updateExpense(txId, { note });
    setDays((prev) =>
      prev.map((d) =>
        d.date !== dayDate ? d : { ...d, transactions: d.transactions.map((t) => (t.id === txId ? saved : t)) }
      )
    );
  }

  return (
    <div className="rounded-2xl border border-white/5 bg-zinc-900/60">
      <div className="border-b border-white/5 p-4">
        <p className="text-xs text-zinc-500">
          {loading ? 'Loading…' : error ? error : `${formatCurrency(total)} total, excludes credits`}
        </p>
      </div>

      <div className="p-4">
        {loading ? (
          <div className="space-y-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="h-14 animate-pulse rounded-xl bg-white/5" />
            ))}
          </div>
        ) : error ? null : days.length === 0 ? (
          <p className="text-sm text-zinc-500">No personal spend yet.</p>
        ) : (
          <div className="space-y-2">
            {days.map((day) => {
              const isOpen = openDays.has(day.date);
              return (
                <div key={day.date} className="overflow-hidden rounded-xl border border-white/5 bg-white/[0.02]">
                  <div className="px-3 py-2.5">
                    <div className="flex items-start justify-between gap-3">
                      <button
                        type="button"
                        onClick={() => toggleDay(day.date)}
                        aria-expanded={isOpen}
                        className="flex min-w-0 flex-1 items-center gap-1.5 text-left text-xs font-medium text-zinc-300"
                      >
                        <ChevronDown
                          size={13}
                          className={`shrink-0 text-zinc-500 transition-transform ${isOpen ? 'rotate-180' : ''}`}
                        />
                        {formatDate(day.date)}
                      </button>
                      <span className="shrink-0 pt-0.5 text-xs text-zinc-500">{formatCurrency(day.total)}</span>
                    </div>
                    <NoteEditor
                      value={day.note}
                      placeholder="What happened today?"
                      addLabel="Add a note for this day"
                      onSave={(note) => handleSaveDayNote(day.date, note)}
                    />
                  </div>
                  {isOpen && (
                    <div className="space-y-0.5 border-t border-white/5 p-1.5">
                      {day.transactions.map((tx) => (
                        <TransactionRow
                          key={tx.id}
                          tx={tx}
                          onSaveNote={(note) => handleSaveTransactionNote(day.date, tx.id, note)}
                        />
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
