import React, { useEffect, useRef, useState } from 'react';
import { MoreVertical, SplitSquareHorizontal, PieChart, Check, History } from 'lucide-react';
import { DEFAULT_POOL_NAME, Transaction } from '../types';
import { poolDotClass } from '../constants';

interface ActionsMenuProps {
  transaction: Transaction;
  /** Pools that existed on this transaction's account at its timestamp. */
  pools: string[];
  onSplit: (tx: Transaction) => void;
  onAllocate: (tx: Transaction) => void;
  onViewSnapshot: (tx: Transaction) => void;
  onTagChange: (pool: string) => void;
}

// Rough worst-case height of the open menu (both action rows + the pool
// list) — used only to decide whether it'd overflow the viewport if
// opened downward, same pattern as CategoryBadge/SpendDayBadge.
const MENU_HEIGHT_ESTIMATE = 320;

/**
 * Every per-row transaction action — Split, Allocate, and moving to a
 * different pool — merged into one dropdown instead of three separate
 * buttons/menus cluttering the row.
 */
export default function ActionsMenu({ transaction, pools, onSplit, onAllocate, onViewSnapshot, onTagChange }: ActionsMenuProps) {
  const [open, setOpen] = useState(false);
  const [openUpward, setOpenUpward] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const activePool = transaction.pool || DEFAULT_POOL_NAME;
  // A transaction can be tagged to a pool its account no longer has (e.g.
  // one removed since) — still show it as the active option rather than
  // silently rendering nothing selected.
  const poolOptions = pools.includes(activePool) ? pools : [...pools, activePool];

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, []);

  function handleToggle() {
    if (!open) {
      // Opening below would run past the bottom of the viewport (most
      // often the last row of a long table) — flip it upward instead of
      // letting the page grow/scroll to fit it.
      const spaceBelow = ref.current ? window.innerHeight - ref.current.getBoundingClientRect().bottom : Infinity;
      setOpenUpward(spaceBelow < MENU_HEIGHT_ESTIMATE);
    }
    setOpen((o) => !o);
  }

  return (
    <div className="relative inline-block text-left" ref={ref}>
      <button
        onClick={handleToggle}
        aria-label="Actions"
        aria-expanded={open}
        className="flex h-11 w-11 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-zinc-300 hover:bg-white/10 md:h-8 md:w-8 md:rounded-lg"
      >
        <MoreVertical size={15} />
      </button>

      {open && (
        <div
          className={`absolute right-0 z-20 w-52 animate-fade-in overflow-hidden rounded-xl border border-white/10 bg-zinc-900 shadow-glow-lg ${
            openUpward ? 'bottom-full mb-1.5' : 'top-full mt-1.5'
          }`}
        >
          <button
            onClick={() => {
              onViewSnapshot(transaction);
              setOpen(false);
            }}
            className="flex w-full items-center gap-2.5 px-3 py-2.5 text-left text-xs text-zinc-300 hover:bg-white/5"
          >
            <History size={13} className="text-emerald-400" />
            View account after transaction
          </button>
          <div className="border-t border-white/5" />
          <button
            onClick={() => {
              onSplit(transaction);
              setOpen(false);
            }}
            className="flex w-full items-center gap-2.5 px-3 py-2.5 text-left text-xs text-zinc-300 hover:bg-white/5"
          >
            <SplitSquareHorizontal size={13} className="text-zinc-500" />
            Split expense
          </button>
          <button
            onClick={() => {
              onAllocate(transaction);
              setOpen(false);
            }}
            className="flex w-full items-center gap-2.5 px-3 py-2.5 text-left text-xs text-zinc-300 hover:bg-white/5"
          >
            <PieChart size={13} className="text-zinc-500" />
            Allocate to pool
          </button>

          <div className="border-t border-white/5 px-3 pb-1 pt-2 text-[10px] font-medium uppercase tracking-wide text-zinc-600">
            Move to pool
          </div>
          <div className="max-h-40 overflow-y-auto">
            {poolOptions.map((name) => {
              const isActive = name === activePool;
              return (
                <button
                  key={name}
                  onClick={() => {
                    if (name !== activePool) onTagChange(name);
                    setOpen(false);
                  }}
                  className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-xs text-zinc-300 hover:bg-white/5"
                >
                  <span className={`h-1.5 w-1.5 rounded-full ${poolDotClass(name)}`} />
                  <span className="flex-1 truncate">{name}</span>
                  {isActive && <Check size={13} className="text-emerald-400" />}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
