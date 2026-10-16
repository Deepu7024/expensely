import React, { useEffect, useRef, useState } from 'react';
import { ChevronDown, FileWarning, Mail, MoreHorizontal, Plus, RefreshCw } from 'lucide-react';

interface Props {
  loading: boolean;
  syncing: boolean;
  onRefresh: () => void;
  onSync: () => void;
  onReport: () => void;
  onAdd: () => void;
}

export default function QuickActions({ loading, syncing, onRefresh, onSync, onReport, onAdd }: Props) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false);
        trigger.current?.focus();
      }
    };
    document.addEventListener('pointerdown', outside);
    document.addEventListener('keydown', escape);
    return () => {
      document.removeEventListener('pointerdown', outside);
      document.removeEventListener('keydown', escape);
    };
  }, [open]);
  const actions = [
    { label: 'Add cash expense', icon: Plus, run: onAdd, primary: true, busy: false },
    { label: syncing ? 'Syncing mail…' : 'Sync from mail', icon: Mail, run: onSync, busy: syncing },
    { label: loading ? 'Refreshing…' : 'Refresh data', icon: RefreshCw, run: onRefresh, busy: loading },
    { label: 'Report missing transaction', icon: FileWarning, run: onReport, busy: false },
  ];
  return (
    <div ref={root} className="relative ml-auto shrink-0" onBlur={(event) => {
      if (!event.currentTarget.contains(event.relatedTarget as Node)) setOpen(false);
    }}>
      <button ref={trigger} aria-label="Quick actions" aria-expanded={open} aria-controls="quick-actions-panel" onClick={() => setOpen(!open)}
        className="flex h-10 w-10 items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/5 text-xs font-medium text-zinc-300 hover:bg-white/10 sm:min-h-11 sm:w-auto sm:px-3">
        <MoreHorizontal size={18} className="sm:hidden" />
        <span className="hidden sm:inline">Quick actions</span>
        <ChevronDown size={14} className={`hidden sm:block ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div id="quick-actions-panel" aria-label="Quick actions" className="absolute right-0 top-full z-30 mt-2 w-64 max-w-[calc(100vw-1.5rem)] rounded-2xl border border-white/10 bg-zinc-900 p-2 shadow-2xl">
          {actions.map(({ label, icon: Icon, run, primary, busy }) => (
            <button key={label} disabled={busy} onClick={() => { setOpen(false); run(); trigger.current?.focus(); }}
              className={`flex min-h-12 w-full items-center gap-3 rounded-xl px-3 text-left text-xs font-medium disabled:opacity-50 ${primary ? 'bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/20' : 'text-zinc-300 hover:bg-white/5'}`}>
              <Icon size={16} className={busy ? 'animate-pulse' : ''} />{label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
