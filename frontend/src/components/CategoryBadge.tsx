import React, { useEffect, useRef, useState } from 'react';
import { Check, ChevronDown, Plus } from 'lucide-react';
import { categoryBadgeClass, categoryDotClass } from '../constants';

interface CategoryBadgeProps {
  category: string;
  /** Every category currently available — required when onChange is passed. */
  categories?: string[];
  /** Omit (along with categories) to render a plain, non-interactive badge. */
  onChange?: (category: string) => void;
  /** Registers a category typed for the first time, so it's available everywhere from now on. */
  onAddCategory?: (name: string) => Promise<void> | void;
}

// Rough worst-case height of the open menu (category list + the "add
// category" row) — used only to decide whether it'd overflow the
// viewport if opened downward, not for exact layout.
const MENU_HEIGHT_ESTIMATE = 260;

export default function CategoryBadge({ category, categories, onChange, onAddCategory }: CategoryBadgeProps) {
  const [open, setOpen] = useState(false);
  const [openUpward, setOpenUpward] = useState(false);
  const [newCategory, setNewCategory] = useState('');
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!onChange) return;
    function onClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, [onChange]);

  if (!onChange || !categories) {
    return (
      <span
        className={`inline-flex items-center whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset ${categoryBadgeClass(category)}`}
      >
        {category}
      </span>
    );
  }

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

  async function handleAddNew() {
    const name = newCategory.trim();
    if (!name) return;
    if (onAddCategory) await onAddCategory(name);
    onChange!(name);
    setNewCategory('');
    setOpen(false);
  }

  return (
    <div className="relative inline-block text-left" ref={ref}>
      <button
        onClick={handleToggle}
        className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset transition-opacity hover:opacity-80 ${categoryBadgeClass(category)}`}
      >
        {category}
        <ChevronDown size={11} className="opacity-60" />
      </button>

      {open && (
        <div
          className={`absolute left-0 z-20 w-48 animate-fade-in overflow-hidden rounded-xl border border-white/10 bg-zinc-900 shadow-glow-lg ${
            openUpward ? 'bottom-full mb-1.5' : 'top-full mt-1.5'
          }`}
        >
          <div className="max-h-56 overflow-y-auto">
            {categories.map((c) => {
              const isActive = c === category;
              return (
                <button
                  key={c}
                  onClick={() => {
                    if (c !== category) onChange(c);
                    setOpen(false);
                  }}
                  className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-xs text-zinc-300 hover:bg-white/5"
                >
                  <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${categoryDotClass(c)}`} />
                  <span className="flex-1 truncate">{c}</span>
                  {isActive && <Check size={13} className="text-emerald-400" />}
                </button>
              );
            })}
          </div>
          {onAddCategory && (
            <div className="flex items-center gap-1 border-t border-white/5 p-1.5">
              <input
                value={newCategory}
                onChange={(e) => setNewCategory(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleAddNew();
                }}
                placeholder="Add category…"
                maxLength={40}
                className="min-w-0 flex-1 rounded-lg border border-white/10 bg-white/5 px-2 py-1.5 text-xs text-zinc-100 outline-none placeholder:text-zinc-600 focus:border-emerald-500/50"
              />
              <button
                onClick={handleAddNew}
                disabled={!newCategory.trim()}
                className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-emerald-500/15 text-emerald-400 disabled:cursor-not-allowed disabled:opacity-40"
                aria-label="Add category"
              >
                <Plus size={12} />
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
