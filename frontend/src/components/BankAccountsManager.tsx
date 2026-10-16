import React, { useEffect, useState } from 'react';
import { ArrowRightLeft, Banknote, Building2, Mail, Plus, Settings, ShieldAlert, SlidersHorizontal, Trash2 } from 'lucide-react';
import { BankAccount, DEFAULT_POOL_NAME, Transaction, computePools } from '../types';
import { BankAccountInput, PoolInput } from '../api';
import { BANK_OPTIONS, poolDotClass } from '../constants';
import { formatCurrency } from '../utils/format';
import TransferPoolModal from './TransferPoolModal';
import ManagePoolsModal, { ManagedPoolValue } from './ManagePoolsModal';

interface BankAccountsManagerProps {
  accounts: BankAccount[];
  /** Used only to show each pool's current live amount in the transfer modal — see computePools. */
  transactions: Transaction[];
  loading?: boolean;
  saving?: boolean;
  deletingId?: string | null;
  transferring?: boolean;
  onAdd: (input: BankAccountInput) => Promise<void> | void;
  onUpdate: (id: string, input: BankAccountInput) => Promise<void> | void;
  onDelete: (id: string) => Promise<void> | void;
  onTransferPool: (accountId: string, fromPool: string, toPool: string, amount: number) => Promise<void> | void;
  onManagePools: (accountId: string, pools: ManagedPoolValue[]) => Promise<void> | void;
}

interface PoolDraft {
  name: string;
  /** Blank means "calculate this one automatically" — see parsePools. Not a flag; whichever field is left empty is the auto one. */
  amount: string;
  isDefault: boolean;
}

type EditValues = {
  bank: string;
  /** A bank often alerts from more than one address — every row here becomes one entry in the emailAddresses sent to the backend, blanks dropped. */
  emailAddresses: string[];
  balance: string;
  minBalance: string;
  pools: PoolDraft[];
};

function toEditValues(account: BankAccount, transactions: Transaction[]): EditValues {
  const live = computePools(account, transactions);
  return {
    bank: account.bank,
    emailAddresses: account.emailAddresses,
    balance: live.total ? String(live.total) : '',
    minBalance: account.minBalance ? String(account.minBalance) : '',
    pools: account.pools.map((p) => ({
      name: p.name,
      amount: p.isAuto ? '' : String(live.byPool[p.name] ?? 0),
      isDefault: p.isDefault,
    })),
  };
}

// Personal starts blank so a brand-new account's whole starting balance
// lands somewhere sensible without extra typing — freely changeable, not
// a fixed rule (see parsePools).
const EMPTY_VALUES: EditValues = {
  bank: BANK_OPTIONS[0],
  emailAddresses: [],
  balance: '',
  minBalance: '',
  pools: [{ name: DEFAULT_POOL_NAME, amount: '', isDefault: true }],
};

/** Trims and drops blanks — the actual set sent to the backend. */
function resolveEmails(emailAddresses: string[]): string[] {
  return emailAddresses.map((a) => a.trim()).filter(Boolean);
}

/** Blank means "not set" — treated as 0, not invalid. */
function toNumberOrZero(raw: string): number {
  return raw.trim() === '' ? 0 : parseFloat(raw);
}

/**
 * Whichever single pool is left blank gets calculated as whatever's left
 * of the balance after every other (typed-in) pool and the reserved
 * minimum balance — type Personal and Savings, and a blank Investment
 * fills itself in, or the other way around. If every pool has a number,
 * or more than one is blank, there's no way to tell which one should be
 * the remainder, so blank ones are just 0 and any difference from the
 * balance isn't tracked in any pool.
 */
function parsePools(balance: number, minBalance: number, pools: PoolDraft[]) {
  const blankIndices = pools.map((p, i) => (p.amount.trim() === '' ? i : -1)).filter((i) => i >= 0);
  const autoIndex = blankIndices.length === 1 ? blankIndices[0] : -1;
  const manualAmounts = pools.map((p, i) => (i === autoIndex ? null : toNumberOrZero(p.amount)));
  const manualValid = manualAmounts.every((v) => v === null || (!Number.isNaN(v) && v >= 0));
  const manualSum = manualAmounts.reduce<number>((sum, v) => sum + (v ?? 0), 0);
  const autoAmount = autoIndex >= 0 ? balance - minBalance - manualSum : null;
  const namesValid =
    pools.every((p) => p.name.trim().length > 0) &&
    new Set(pools.map((p) => p.name.trim())).size === pools.length;

  const resolved: PoolInput[] = pools.map((p, i) => ({
    name: p.name.trim(),
    isAuto: i === autoIndex,
    startingAmount: i === autoIndex ? Math.max(0, autoAmount ?? 0) : (manualAmounts[i] as number),
  }));

  return { resolved, manualValid, namesValid, autoAmount, autoIndex };
}

function parseValues(values: EditValues) {
  const balance = parseFloat(values.balance);
  const minBalance = toNumberOrZero(values.minBalance);
  const balanceValid = !Number.isNaN(balance) && balance >= 0;
  const minBalanceValid = !Number.isNaN(minBalance) && minBalance >= 0;
  const bankValid = values.bank.trim().length > 0;

  const { resolved, manualValid, namesValid, autoAmount, autoIndex } = parsePools(
    balanceValid ? balance : 0,
    minBalanceValid ? minBalance : 0,
    values.pools
  );

  const isValid = bankValid && balanceValid && minBalanceValid && manualValid && namesValid && values.pools.length > 0;
  const allocatedSum = resolved.reduce((sum, p) => sum + p.startingAmount, 0);
  const unaccounted = balanceValid && minBalanceValid ? balance - minBalance - allocatedSum : 0;

  return { balance, minBalance, resolved, isValid, autoAmount, autoIndex, unaccounted };
}

function PoolRow({
  pool,
  isAuto,
  autoAmount,
  onChange,
  onRemove,
}: {
  pool: PoolDraft;
  isAuto: boolean;
  autoAmount: number;
  onChange: (patch: Partial<PoolDraft>) => void;
  onRemove: () => void;
}) {
  return (
    <div className="flex items-center gap-1.5">
      <span className={`h-2 w-2 shrink-0 rounded-full ${poolDotClass(pool.name || 'pool')}`} />
      <input
        value={pool.name}
        disabled={pool.isDefault}
        onChange={(e) => onChange({ name: e.target.value })}
        placeholder="Pool name"
        maxLength={40}
        className="min-w-0 flex-1 rounded-lg border border-white/10 bg-white/5 px-2.5 py-2 text-sm text-zinc-100 outline-none focus:border-emerald-500/50 disabled:opacity-70"
      />
      <div className="relative w-28 shrink-0">
        <span className="pointer-events-none absolute inset-y-0 left-2.5 flex items-center text-xs text-zinc-500">₹</span>
        <input
          type="number"
          inputMode="decimal"
          min={0}
          value={pool.amount}
          onChange={(e) => onChange({ amount: e.target.value })}
          placeholder={isAuto ? String(Math.round(Math.max(0, autoAmount))) : '0.00'}
          className="w-full rounded-lg border border-white/10 bg-white/5 py-2 pl-6 pr-2 text-sm text-zinc-100 outline-none focus:border-emerald-500/50"
        />
      </div>
      {!pool.isDefault && (
        <button
          type="button"
          onClick={onRemove}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/5 text-zinc-400 ring-1 ring-white/10 hover:bg-red-500/10 hover:text-red-400"
          aria-label={`Remove ${pool.name || 'pool'}`}
        >
          <Trash2 size={13} />
        </button>
      )}
    </div>
  );
}

function EmailRow({
  value,
  onChange,
  onRemove,
}: {
  value: string;
  onChange: (value: string) => void;
  onRemove: () => void;
}) {
  return (
    <div className="flex items-center gap-1.5">
      <input
        type="email"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="alerts@hdfcbank.bank.in"
        className="min-w-0 flex-1 rounded-lg border border-white/10 bg-white/5 px-2.5 py-2 text-sm text-zinc-100 outline-none placeholder:text-zinc-600 focus:border-emerald-500/50"
      />
      <button
        type="button"
        onClick={onRemove}
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/5 text-zinc-400 ring-1 ring-white/10 hover:bg-red-500/10 hover:text-red-400"
        aria-label="Remove this sender address"
      >
        <Trash2 size={13} />
      </button>
    </div>
  );
}

function AccountFieldsForm({
  values,
  onChange,
  showIdentity,
  isExistingAccount = false,
  showPools = true,
}: {
  values: EditValues;
  onChange: (values: EditValues) => void;
  showIdentity: boolean;
  isExistingAccount?: boolean;
  showPools?: boolean;
}) {
  const { autoAmount, autoIndex, unaccounted } = parseValues(values);
  const autoNegative = autoIndex >= 0 && (autoAmount ?? 0) < 0;
  // A bank not in the known list (including one saved as literal "Other"
  // before this custom-name input existed) — show a text field instead of
  // leaving it as an unhelpful "Other".
  const isCustomBank = !BANK_OPTIONS.includes(values.bank) || values.bank === 'Other';

  function updatePool(index: number, patch: Partial<PoolDraft>) {
    onChange({ ...values, pools: values.pools.map((p, i) => (i === index ? { ...p, ...patch } : p)) });
  }

  function addPool() {
    onChange({ ...values, pools: [...values.pools, { name: '', amount: '', isDefault: false }] });
  }

  function removePool(index: number) {
    onChange({ ...values, pools: values.pools.filter((_, i) => i !== index) });
  }

  function updateEmail(index: number, address: string) {
    onChange({ ...values, emailAddresses: values.emailAddresses.map((a, i) => (i === index ? address : a)) });
  }

  function addEmail() {
    onChange({ ...values, emailAddresses: [...values.emailAddresses, ''] });
  }

  function removeEmail(index: number) {
    onChange({ ...values, emailAddresses: values.emailAddresses.filter((_, i) => i !== index) });
  }

  return (
    <div className="space-y-3">
      {showIdentity && (
        <>
          <div>
            <label className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-zinc-400">
              <Building2 size={13} className="text-zinc-500" />
              Bank
            </label>
            <select
              value={isCustomBank ? 'Other' : values.bank}
              onChange={(e) => onChange({ ...values, bank: e.target.value === 'Other' ? '' : e.target.value })}
              className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 text-sm text-zinc-100 outline-none focus:border-emerald-500/50 focus:ring-1 focus:ring-emerald-500/50"
            >
              {BANK_OPTIONS.map((option) => (
                <option key={option} value={option} className="bg-zinc-900 text-zinc-100">
                  {option}
                </option>
              ))}
            </select>
            {isCustomBank && (
              <input
                type="text"
                autoFocus
                value={values.bank}
                onChange={(e) => onChange({ ...values, bank: e.target.value })}
                placeholder="Enter your bank's name"
                className="mt-2 w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 text-sm text-zinc-100 outline-none placeholder:text-zinc-600 focus:border-emerald-500/50 focus:ring-1 focus:ring-emerald-500/50"
              />
            )}
          </div>
          <div>
            <label className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-zinc-400">
              <Mail size={13} className="text-zinc-500" />
              Gmail sender addresses (optional — leave empty for a manual-only account)
            </label>
            {values.emailAddresses.length > 0 && (
              <div className="space-y-2">
                {values.emailAddresses.map((address, index) => (
                  <EmailRow
                    key={index}
                    value={address}
                    onChange={(v) => updateEmail(index, v)}
                    onRemove={() => removeEmail(index)}
                  />
                ))}
              </div>
            )}
            <button
              type="button"
              onClick={addEmail}
              className={`inline-flex items-center gap-1 text-xs font-medium text-emerald-400 hover:text-emerald-300 ${
                values.emailAddresses.length > 0 ? 'mt-2' : ''
              }`}
            >
              <Plus size={12} />
              Add a sender address
            </button>
            <p className="mt-1.5 text-[11px] text-zinc-500">
              A bank often alerts from more than one address (transactions vs. statements, say) —
              add each one you want mail sync to scan.
            </p>
          </div>
        </>
      )}

      {showPools && (
        <>
      <div>
        <label className="mb-1.5 block text-xs font-medium text-zinc-400">
          {isExistingAccount ? 'Current balance' : 'Starting balance'}
        </label>
        <div className="relative">
          <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-sm text-zinc-500">₹</span>
          <input
            type="number"
            inputMode="decimal"
            min={0}
            value={values.balance}
            onChange={(e) => onChange({ ...values, balance: e.target.value })}
            placeholder="0.00"
            className="w-full rounded-xl border border-white/10 bg-white/5 py-2.5 pl-7 pr-3 text-sm text-zinc-100 outline-none placeholder:text-zinc-600 focus:border-emerald-500/50 focus:ring-1 focus:ring-emerald-500/50"
          />
        </div>
      </div>

      <div>
        <label className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-zinc-400">
          <ShieldAlert size={13} className="text-zinc-500" />
          Minimum balance (optional — reserved, never counted toward any pool)
        </label>
        <div className="relative">
          <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-sm text-zinc-500">₹</span>
          <input
            type="number"
            inputMode="decimal"
            min={0}
            value={values.minBalance}
            onChange={(e) => onChange({ ...values, minBalance: e.target.value })}
            placeholder="0.00"
            className="w-full rounded-xl border border-white/10 bg-white/5 py-2.5 pl-7 pr-3 text-sm text-zinc-100 outline-none placeholder:text-zinc-600 focus:border-emerald-500/50 focus:ring-1 focus:ring-emerald-500/50"
          />
        </div>
      </div>

      <div>
        <div className="mb-1.5 flex items-center justify-between">
          <span className="text-xs font-medium text-zinc-400">Pools</span>
          <button
            type="button"
            onClick={addPool}
            className="inline-flex items-center gap-1 text-xs font-medium text-emerald-400 hover:text-emerald-300"
          >
            <Plus size={12} />
            Add a pool
          </button>
        </div>
        <div className="space-y-2">
          {values.pools.map((pool, index) => (
            <PoolRow
              key={index}
              pool={pool}
              isAuto={index === autoIndex}
              autoAmount={autoAmount ?? 0}
              onChange={(patch) => updatePool(index, patch)}
              onRemove={() => removePool(index)}
            />
          ))}
        </div>
        <p className="mt-2 text-[11px] text-zinc-500">
          Personal always stays — remove Business, Savings, or any pool you don't need, or add your
          own split. Leave exactly one pool's amount blank and it fills in automatically as
          whatever's left of the balance.
        </p>
      </div>

      {showPools && autoNegative && (
        <div className="flex items-start gap-2 rounded-xl border border-amber-500/25 bg-amber-500/10 px-3 py-2.5 text-xs text-amber-300">
          <ShieldAlert size={14} className="mt-0.5 shrink-0" />
          The other pools plus the minimum balance exceed the {isExistingAccount ? 'current' : 'starting'} balance, so the blank pool
          would go negative.
        </div>
      )}
      {showPools && !autoNegative && autoIndex < 0 && Math.round(unaccounted) !== 0 && (
        <p className="text-[11px] text-zinc-500">
          {unaccounted > 0
            ? `${formatCurrency(unaccounted)} of the ${isExistingAccount ? 'current' : 'starting'} balance isn't in any pool.`
            : `Pools add up to ${formatCurrency(Math.abs(unaccounted))} more than the ${isExistingAccount ? 'current' : 'starting'} balance.`}
        </p>
      )}
        </>
      )}
    </div>
  );
}

function AccountCard({
  account,
  transactions,
  saving,
  deleting,
  transferring,
  onUpdate,
  onDelete,
  onTransferPool,
  onManagePools,
}: {
  account: BankAccount;
  transactions: Transaction[];
  saving?: boolean;
  deleting?: boolean;
  transferring?: boolean;
  onUpdate: (input: BankAccountInput) => Promise<void> | void;
  onDelete: () => Promise<void> | void;
  onTransferPool: (fromPool: string, toPool: string, amount: number) => Promise<void> | void;
  onManagePools: (pools: ManagedPoolValue[]) => Promise<void> | void;
}) {
  const [editing, setEditing] = useState(false);
  const [transferOpen, setTransferOpen] = useState(false);
  const [managePoolsOpen, setManagePoolsOpen] = useState(false);
  const [values, setValues] = useState<EditValues>(() => toEditValues(account, transactions));
  const live = computePools(account, transactions);

  useEffect(() => {
    if (!editing) setValues(toEditValues(account, transactions));
  }, [account, transactions, editing]);

  const { isValid, balance } = parseValues(values);
  const total = editing && isValid ? balance : live.total;

  function toggleEditing() {
    if (!editing) setValues(toEditValues(account, transactions));
    setEditing((current) => !current);
  }

  async function handleSave() {
    const parsed = parseValues(values);
    if (!parsed.isValid) return;
    await onUpdate({
      bank: values.bank,
      emailAddresses: resolveEmails(values.emailAddresses),
      balance: parsed.balance,
      minBalance: parsed.minBalance,
      pools: parsed.resolved,
    });
    setEditing(false);
  }

  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 text-sm font-medium text-zinc-100">
            <Building2 size={14} className="text-zinc-500" />
            {account.bank}
          </div>
          {account.emailAddresses.length > 0 ? (
            <div className="mt-0.5 truncate font-mono text-[11px] text-zinc-500">
              {account.emailAddresses.join(', ')}
            </div>
          ) : (
            <div className="mt-0.5 text-[11px] text-zinc-600">Manual entries only — no Gmail sender</div>
          )}
          <div className="mt-1.5 text-lg font-semibold text-zinc-50">{formatCurrency(total)}</div>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {account.pools.map((p) => (
              <span
                key={p.id}
                className="inline-flex items-center gap-1 rounded-full bg-white/5 px-2 py-0.5 text-[10px] font-medium text-zinc-400 ring-1 ring-inset ring-white/10"
              >
                <span className={`h-1.5 w-1.5 rounded-full ${poolDotClass(p.name)}`} />
                {p.name} · {formatCurrency(live.byPool[p.name] ?? 0)}
              </span>
            ))}
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-1.5">
          <button
            onClick={() => setManagePoolsOpen(true)}
            className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/5 text-zinc-400 ring-1 ring-white/10 hover:text-zinc-200"
            aria-label={`Manage ${account.bank} pools`}
            title="Manage pools"
          >
            <SlidersHorizontal size={14} />
          </button>
          {account.pools.length > 1 && (
            <button
              onClick={() => setTransferOpen(true)}
              className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/5 text-zinc-400 ring-1 ring-white/10 hover:text-zinc-200"
              aria-label={`Transfer between ${account.bank} pools`}
              title="Transfer between pools"
            >
              <ArrowRightLeft size={14} />
            </button>
          )}
          <button
            onClick={toggleEditing}
            className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/5 text-zinc-400 ring-1 ring-white/10 hover:text-zinc-200"
            aria-label={`Edit ${account.bank}`}
          >
            <Settings size={14} />
          </button>
          <button
            onClick={onDelete}
            disabled={deleting}
            className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/5 text-zinc-400 ring-1 ring-white/10 hover:bg-red-500/10 hover:text-red-400 disabled:cursor-not-allowed disabled:opacity-40"
            aria-label={`Remove ${account.bank}`}
          >
            <Trash2 size={14} />
          </button>
        </div>
      </div>

      {transferOpen && (
        <TransferPoolModal
          account={account}
          poolAmounts={computePools(account, transactions).byPool}
          submitting={transferring}
          onClose={() => setTransferOpen(false)}
          onConfirm={async (fromPool, toPool, amount) => {
            await onTransferPool(fromPool, toPool, amount);
            setTransferOpen(false);
          }}
        />
      )}

      {managePoolsOpen && (
        <ManagePoolsModal
          account={account}
          poolAmounts={live.byPool}
          submitting={saving}
          onClose={() => setManagePoolsOpen(false)}
          onConfirm={async (pools) => {
            await onManagePools(pools);
            setManagePoolsOpen(false);
          }}
        />
      )}

      {editing && (
        <div className="mt-4 space-y-3 border-t border-white/5 pt-4">
          <div className="rounded-xl border border-emerald-500/15 bg-emerald-500/5 px-3 py-2.5 text-xs text-emerald-200">
            Bank details only. Use Manage pools to reorganize live balances without changing transaction history.
          </div>
          <AccountFieldsForm values={values} onChange={setValues} showIdentity isExistingAccount showPools={false} />
          <div className="flex justify-end gap-2 pt-1">
            <button
              onClick={() => setEditing(false)}
              className="rounded-xl px-4 py-2.5 text-sm font-medium text-zinc-400 hover:bg-white/5 hover:text-zinc-200"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={!isValid || saving}
              className="rounded-xl bg-emerald-500 px-4 py-2.5 text-sm font-medium text-emerald-950 hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function BankAccountsManager({
  accounts,
  transactions,
  loading,
  saving,
  deletingId,
  transferring,
  onAdd,
  onUpdate,
  onDelete,
  onTransferPool,
  onManagePools,
}: BankAccountsManagerProps) {
  const [addingOpen, setAddingOpen] = useState(false);
  const [addValues, setAddValues] = useState<EditValues>(EMPTY_VALUES);
  const { isValid, balance, minBalance, resolved } = parseValues(addValues);

  // Neither built-in account is something you set up: Cash is just where
  // manual/cash entries and unmatched mail-sync transactions fall back
  // to, and Deleted Accounts is just where a removed account's old
  // transactions land — so neither has a place in this list.
  const realAccounts = accounts.filter((a) => !a.isDefault && !a.isArchive);

  async function handleAdd() {
    if (!isValid) return;
    await onAdd({
      bank: addValues.bank,
      emailAddresses: resolveEmails(addValues.emailAddresses),
      balance,
      minBalance,
      pools: resolved,
    });
    setAddValues(EMPTY_VALUES);
    setAddingOpen(false);
  }

  return (
    <div className="space-y-4">
      {loading ? (
        <div className="animate-pulse space-y-3">
          <div className="h-24 rounded-2xl bg-white/5" />
          <div className="h-24 rounded-2xl bg-white/5" />
        </div>
      ) : (
        realAccounts.map((account) => (
          <AccountCard
            key={account.id}
            account={account}
            transactions={transactions}
            saving={saving}
            deleting={deletingId === account.id}
            transferring={transferring}
            onUpdate={(input) => onUpdate(account.id, input)}
            onDelete={() => onDelete(account.id)}
            onTransferPool={(fromPool, toPool, amount) => onTransferPool(account.id, fromPool, toPool, amount)}
            onManagePools={(pools) => onManagePools(account.id, pools)}
          />
        ))
      )}

      <div className="border-t border-white/5 pt-4">
        {addingOpen ? (
          <div className="space-y-3">
            <AccountFieldsForm values={addValues} onChange={setAddValues} showIdentity />
            <div className="flex justify-end gap-2 pt-1">
              <button
                onClick={() => {
                  setAddingOpen(false);
                  setAddValues(EMPTY_VALUES);
                }}
                className="rounded-xl px-4 py-2.5 text-sm font-medium text-zinc-400 hover:bg-white/5 hover:text-zinc-200"
              >
                Cancel
              </button>
              <button
                onClick={handleAdd}
                disabled={!isValid || saving}
                className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-500 px-4 py-2.5 text-sm font-medium text-emerald-950 hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <Plus size={15} />
                {saving ? 'Adding…' : 'Add bank account'}
              </button>
            </div>
          </div>
        ) : (
          <button
            onClick={() => setAddingOpen(true)}
            className="inline-flex w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-white/15 px-4 py-3 text-sm font-medium text-zinc-400 hover:border-white/25 hover:text-zinc-200"
          >
            <Banknote size={15} />
            Add another bank account
          </button>
        )}
      </div>
    </div>
  );
}
