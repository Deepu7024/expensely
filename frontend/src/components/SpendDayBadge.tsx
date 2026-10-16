import React, { useEffect, useRef, useState } from 'react';
import { CalendarClock } from 'lucide-react';
import { Transaction } from '../types';
import { formatDate } from '../utils/format';

interface SpendDayBadgeProps {
  transaction: Transaction;
  /** Pass null to clear the override — back to the transaction's own date. Omit onChange entirely to render read-only. */
  onChange?: (spendDay: string | null) => void;
}

// Rough worst-case height of the open popover — used only to decide
// whether it'd overflow the viewport if opened downward, same pattern as
// CategoryBadge/TagMenu.
const POPOVER_HEIGHT_ESTIMATE = 100;

/** Local YYYY-MM-DD for a native date input, matching what formatDate actually displays for this transaction's real timestamp. */
function toLocalDateInputValue(iso: string): string {
  const d = new Date(iso);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * Shows a transaction's real date, plus lets you set an override for
 * which day its spend should count toward instead — e.g. "spent
 * yesterday, only paid back/logged today." The real `date` (used for
 * balance/ordering/anchoredAt scoping) is never touched; this only
 * changes the day-bucket on the Personal Spend by day page and "Today's
 * Spend" — see effectiveSpendDay in types.ts.
 */
export default function SpendDayBadge({ transaction, onChange }: SpendDayBadgeProps) {
  const [open, setOpen] = useState(false);
  const [openUpward, setOpenUpward] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const { date, effectiveDate } = transaction;

  useEffect(() => {
    if (!onChange) return;
    function onClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, [onChange]);

  if (!onChange) {
    return (
      <div>
        <div>{formatDate(date)}</div>
        {effectiveDate && (
          <div className="text-[10px] italic text-amber-400">spent on {formatDate(effectiveDate)}</div>
        )}
      </div>
    );
  }

  function handleToggle() {
    if (!open) {
      const spaceBelow = ref.current ? window.innerHeight - ref.current.getBoundingClientRect().bottom : Infinity;
      setOpenUpward(spaceBelow < POPOVER_HEIGHT_ESTIMATE);
    }
    setOpen((o) => !o);
  }

  return (
    <div className="relative inline-block text-left" ref={ref}>
      <div className="flex items-center gap-1 whitespace-nowrap">
        <span className="whitespace-nowrap tabular-nums">{formatDate(date)}</span>
        <button
          onClick={handleToggle}
          aria-label="Mark this as spent on a different day"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-zinc-500 hover:bg-white/5 hover:text-zinc-300 md:h-6 md:w-6"
        >
          <CalendarClock size={12} />
        </button>
      </div>
      {effectiveDate && (
        <button
          onClick={() => onChange(null)}
          className="mt-0.5 block text-[10px] italic text-amber-400 hover:text-amber-300"
        >
          spent on {formatDate(effectiveDate)} · reset
        </button>
      )}

      {open && (
        <div
          className={`absolute left-0 z-20 w-56 animate-fade-in rounded-xl border border-white/10 bg-zinc-900 p-2.5 shadow-glow-lg ${
            openUpward ? 'bottom-full mb-1.5' : 'top-full mt-1.5'
          }`}
        >
          <p className="mb-1.5 text-[11px] text-zinc-500">Which day was this actually spent on?</p>
          <input
            type="date"
            autoFocus
            defaultValue={effectiveDate ?? toLocalDateInputValue(date)}
            onChange={(e) => {
              if (!e.target.value) return;
              onChange(e.target.value);
              setOpen(false);
            }}
            className="w-full rounded-lg border border-white/10 bg-white/5 px-2 py-1.5 text-xs text-zinc-200 outline-none focus:border-emerald-500/50"
          />
        </div>
      )}
    </div>
  );
}
