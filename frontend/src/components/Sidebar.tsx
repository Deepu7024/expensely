import React from 'react';
import { LayoutDashboard, Receipt, PenLine, BarChart3, Wallet, Landmark, LogOut, Tag, X } from 'lucide-react';
import { API_BASE_URL } from '../constants';
import { formatCurrency } from '../utils/format';

export type View = 'dashboard' | 'transactions' | 'manual' | 'analytics' | 'account' | 'categories' | 'personalSpend';

interface NavItem {
  key: View;
  label: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
}

const NAV_ITEMS: NavItem[] = [
  { key: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { key: 'transactions', label: 'Transactions', icon: Receipt },
  { key: 'manual', label: 'Manual Entry', icon: PenLine },
  { key: 'analytics', label: 'Analytics', icon: BarChart3 },
  { key: 'account', label: 'Accounts', icon: Landmark },
  { key: 'categories', label: 'Categories', icon: Tag },
];

/** Just the host, for a compact "Connected to" footer — API_BASE_URL itself includes the /api suffix. */
function backendHost(): string {
  try {
    return new URL(API_BASE_URL).host;
  } catch {
    return API_BASE_URL;
  }
}

interface SidebarProps {
  active: View;
  onNavigate: (view: View) => void;
  open: boolean;
  onClose: () => void;
  /** This month's personal-pool spend so far — see personalSpendTotal in types.ts. */
  personalSpend: number;
  monthlyBudget: number;
  userEmail: string;
  onLogout: () => Promise<void>;
}

export default function Sidebar({ active, onNavigate, open, onClose, personalSpend, monthlyBudget, userEmail, onLogout }: SidebarProps) {
  const budgetPct = monthlyBudget > 0 ? Math.min(100, Math.round((personalSpend / monthlyBudget) * 100)) : 0;
  const budgetColor =
    budgetPct >= 100 ? 'bg-red-500' : budgetPct >= 80 ? 'bg-amber-400' : 'bg-emerald-500';
  return (
    <>
      {/* Mobile scrim */}
      {open && (
        <div
          className="fixed inset-0 z-30 bg-black/60 backdrop-blur-sm lg:hidden"
          onClick={onClose}
        />
      )}

      <aside
        className={`fixed inset-y-0 left-0 z-40 flex h-[100dvh] w-[min(86vw,20rem)] shrink-0 transform flex-col overflow-hidden border-r border-white/5 bg-zinc-950 shadow-2xl transition-transform duration-200 ease-out lg:static lg:h-screen lg:w-64 lg:translate-x-0 lg:shadow-none ${
          open ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex h-16 shrink-0 items-center justify-between px-5 pt-[env(safe-area-inset-top)]">
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-500/10 ring-1 ring-emerald-500/25">
              <Wallet size={18} className="text-emerald-400" />
            </div>
            <span className="text-base font-semibold tracking-tight text-zinc-100">
              Expensely
            </span>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-zinc-500 hover:bg-white/5 hover:text-zinc-300 lg:hidden"
            aria-label="Close menu"
          >
            <X size={18} />
          </button>
        </div>

        <nav className="mt-2 flex flex-col gap-1 px-3">
          {NAV_ITEMS.map((item) => {
            const isActive = active === item.key;
            const Icon = item.icon;
            return (
              <button
                key={item.key}
                onClick={() => {
                  onNavigate(item.key);
                  onClose();
                }}
                className={`group flex min-h-11 items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-emerald-500/10 text-emerald-300 ring-1 ring-inset ring-emerald-500/20'
                    : 'text-zinc-400 hover:bg-white/5 hover:text-zinc-200'
                }`}
              >
                <Icon
                  size={18}
                  className={isActive ? 'text-emerald-400' : 'text-zinc-500 group-hover:text-zinc-300'}
                />
                {item.label}
              </button>
            );
          })}
        </nav>

        <button
          onClick={() => {
            onNavigate('personalSpend');
            onClose();
          }}
          className="mx-3 mt-4 block w-[calc(100%-1.5rem)] rounded-xl border border-white/5 bg-white/[0.03] p-3 text-left hover:bg-white/[0.06]"
          aria-label="View monthly budget details"
        >
          <div className="flex items-center justify-between">
            <span className="inline-flex items-center gap-1.5 text-xs font-medium text-zinc-400">
              <Wallet size={13} className="text-emerald-400" />
              Monthly Budget
            </span>
            <span className="text-[11px] text-zinc-500">{budgetPct}%</span>
          </div>
          <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-white/5">
            <div
              className={`h-full rounded-full transition-all ${budgetColor}`}
              style={{ width: `${budgetPct}%` }}
            />
          </div>
          <div className="mt-1.5 flex items-baseline justify-between text-[11px] text-zinc-500">
            <span>{formatCurrency(personalSpend)}</span>
            <span>of {formatCurrency(monthlyBudget)}</span>
          </div>
        </button>

        <div className="mt-auto shrink-0 border-t border-white/5 p-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
          <div className="rounded-xl bg-white/[0.03] p-3">
            <div className="truncate text-xs font-medium text-zinc-300" title={userEmail}>{userEmail}</div>
            <div className="mt-0.5 truncate text-[10px] text-zinc-600" title={API_BASE_URL}>Connected to {backendHost()}</div>
            <button onClick={() => void onLogout()} className="mt-3 inline-flex w-full items-center justify-center gap-1.5 rounded-lg border border-white/10 py-2 text-xs font-medium text-zinc-400 hover:bg-white/5 hover:text-zinc-200">
              <LogOut size={13} /> Sign out
            </button>
          </div>
        </div>
      </aside>
    </>
  );
}
