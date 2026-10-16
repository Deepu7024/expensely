import React, { useState } from 'react';
import { Check, Pencil, Tag, Trash2, X } from 'lucide-react';
import { categoryDotClass } from '../constants';
import { Transaction } from '../types';

interface CategoriesManagerProps {
  categories: string[];
  transactions: Transaction[];
  saving?: boolean;
  deletingName?: string | null;
  onAdd: (name: string) => Promise<void> | void;
  onRename: (name: string, newName: string) => Promise<void> | void;
  onDelete: (name: string) => Promise<void> | void;
}

/** The built-in catch-all category — can't be renamed or deleted (mirrors the backend guard). */
const FALLBACK_CATEGORY = 'Other';

function CategoryRow({
  name,
  transactionCount,
  saving,
  deleting,
  onRename,
  onDelete,
}: {
  name: string;
  transactionCount: number;
  saving?: boolean;
  deleting?: boolean;
  onRename: (newName: string) => Promise<void> | void;
  onDelete: () => Promise<void> | void;
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(name);
  const isLocked = name === FALLBACK_CATEGORY;

  async function handleSave() {
    const trimmed = value.trim();
    if (!trimmed || trimmed === name) {
      setEditing(false);
      setValue(name);
      return;
    }
    await onRename(trimmed);
    setEditing(false);
  }

  return (
    <div className="flex items-center gap-2.5 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2.5">
      <span className={`h-2 w-2 shrink-0 rounded-full ${categoryDotClass(name)}`} />

      {editing ? (
        <>
          <input
            autoFocus
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleSave();
              if (e.key === 'Escape') {
                setEditing(false);
                setValue(name);
              }
            }}
            maxLength={40}
            className="min-w-0 flex-1 rounded-lg border border-white/10 bg-white/5 px-2 py-1.5 text-sm text-zinc-100 outline-none focus:border-emerald-500/50"
          />
          <button
            onClick={handleSave}
            disabled={saving || !value.trim()}
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-emerald-500/15 text-emerald-400 disabled:cursor-not-allowed disabled:opacity-40"
            aria-label={`Save ${name}`}
          >
            <Check size={13} />
          </button>
          <button
            onClick={() => {
              setEditing(false);
              setValue(name);
            }}
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-white/5 text-zinc-400 hover:text-zinc-200"
            aria-label="Cancel"
          >
            <X size={13} />
          </button>
        </>
      ) : (
        <>
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm text-zinc-200">{name}</div>
            <div className="mt-0.5 text-[11px] text-zinc-500">
              {transactionCount === 0
                ? 'No transactions yet'
                : `${transactionCount} transaction${transactionCount === 1 ? '' : 's'}`}
            </div>
          </div>
          {isLocked ? (
            <span className="shrink-0 rounded-full bg-white/5 px-2 py-0.5 text-[10px] font-medium text-zinc-500 ring-1 ring-inset ring-white/10">
              Built-in
            </span>
          ) : (
            <>
              <button
                onClick={() => setEditing(true)}
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-white/5 text-zinc-400 ring-1 ring-white/10 hover:text-zinc-200"
                aria-label={`Rename ${name}`}
              >
                <Pencil size={12} />
              </button>
              <button
                onClick={onDelete}
                disabled={deleting}
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-white/5 text-zinc-400 ring-1 ring-white/10 hover:bg-red-500/10 hover:text-red-400 disabled:cursor-not-allowed disabled:opacity-40"
                aria-label={`Delete ${name}`}
              >
                <Trash2 size={12} />
              </button>
            </>
          )}
        </>
      )}
    </div>
  );
}

export default function CategoriesManager({
  categories,
  transactions,
  saving,
  deletingName,
  onAdd,
  onRename,
  onDelete,
}: CategoriesManagerProps) {
  const [addingOpen, setAddingOpen] = useState(false);
  const [newName, setNewName] = useState('');

  async function handleAdd() {
    const trimmed = newName.trim();
    if (!trimmed) return;
    await onAdd(trimmed);
    setNewName('');
    setAddingOpen(false);
  }

  return (
    <div className="space-y-2.5">
      {categories.map((name) => (
        <CategoryRow
          key={name}
          name={name}
          transactionCount={transactions.filter((transaction) => transaction.category === name).length}
          saving={saving}
          deleting={deletingName === name}
          onRename={(newName) => onRename(name, newName)}
          onDelete={() => onDelete(name)}
        />
      ))}

      <div className="border-t border-white/5 pt-3">
        {addingOpen ? (
          <div className="flex items-center gap-1.5">
            <input
              autoFocus
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleAdd();
                if (e.key === 'Escape') {
                  setAddingOpen(false);
                  setNewName('');
                }
              }}
              placeholder="New category name"
              maxLength={40}
              className="min-w-0 flex-1 rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 text-sm text-zinc-100 outline-none placeholder:text-zinc-600 focus:border-emerald-500/50 focus:ring-1 focus:ring-emerald-500/50"
            />
            <button
              onClick={handleAdd}
              disabled={!newName.trim() || saving}
              className="shrink-0 rounded-xl bg-emerald-500/15 px-3 py-2.5 text-xs font-medium text-emerald-300 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Add
            </button>
          </div>
        ) : (
          <button
            onClick={() => setAddingOpen(true)}
            className="inline-flex w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-white/15 px-4 py-3 text-sm font-medium text-zinc-400 hover:border-white/25 hover:text-zinc-200"
          >
            <Tag size={15} />
            Add another category
          </button>
        )}
      </div>
    </div>
  );
}
