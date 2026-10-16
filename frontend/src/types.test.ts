import {
  BankAccount,
  Transaction,
  combinePools,
  computeAccountSnapshotAfter,
  poolNamesAt,
  transactionsInMonth,
} from './types';

const account: BankAccount = {
  id: 'account-1',
  bank: 'Test Bank',
  emailAddresses: [],
  isDefault: false,
  isArchive: false,
  balance: 1000,
  minBalance: 100,
  anchoredAt: '2026-01-01T00:00:00.000Z',
  pools: [
    { id: 'personal', name: 'Personal', startingAmount: 600, isAuto: false, isDefault: true },
    { id: 'savings', name: 'Savings', startingAmount: 300, isAuto: false, isDefault: false },
  ],
};

const baseTransaction: Omit<Transaction, 'id' | 'date' | 'merchant' | 'amount' | 'type' | 'pool'> = {
  accountId: account.id,
  category: 'Other',
  source: 'Email',
  isSplit: false,
  isAllocated: false,
};

test('reconstructs pool balances immediately after the selected transaction', () => {
  const first: Transaction = {
    ...baseTransaction,
    id: 'first',
    date: '2026-01-02T10:00:00.000Z',
    merchant: 'Cafe',
    amount: 50,
    type: 'Debit',
    pool: 'Personal',
  };
  const second: Transaction = {
    ...baseTransaction,
    id: 'second',
    date: '2026-01-03T10:00:00.000Z',
    merchant: 'Transfer',
    amount: 100,
    type: 'Credit',
    pool: 'Savings',
    isAllocated: true,
    allocationPool: 'Personal',
    allocationAmount: 40,
  };

  expect(computeAccountSnapshotAfter(account, [second, first], first.id)).toEqual({
    byPool: { Personal: 550, Savings: 300 },
    reserved: 100,
    total: 950,
  });
  expect(computeAccountSnapshotAfter(account, [second, first], second.id)).toEqual({
    byPool: { Personal: 590, Savings: 360 },
    reserved: 100,
    total: 1050,
  });
});

test('returns null for history older than the account anchor', () => {
  const oldTransaction: Transaction = {
    ...baseTransaction,
    id: 'old',
    date: '2025-12-31T10:00:00.000Z',
    merchant: 'Old purchase',
    amount: 25,
    type: 'Debit',
    pool: 'Personal',
  };

  expect(computeAccountSnapshotAfter(account, [oldTransaction], oldTransaction.id)).toBeNull();
});

test('applies pool reallocations only to snapshots after the event', () => {
  const beforeMove: Transaction = {
    ...baseTransaction,
    id: 'before-move',
    date: '2026-01-02T10:00:00.000Z',
    merchant: 'Cafe',
    amount: 50,
    type: 'Debit',
    pool: 'Personal',
  };
  const afterMove: Transaction = {
    ...baseTransaction,
    id: 'after-move',
    date: '2026-01-04T10:00:00.000Z',
    merchant: 'Grocer',
    amount: 20,
    type: 'Debit',
    pool: 'Personal',
  };
  const withAllocation: BankAccount = {
    ...account,
    allocationEvents: [{
      id: 'move',
      fromPool: 'Savings',
      toPool: 'Personal',
      amount: 100,
      createdAt: '2026-01-03T10:00:00.000Z',
    }],
  };

  expect(computeAccountSnapshotAfter(withAllocation, [beforeMove, afterMove], beforeMove.id)?.byPool).toEqual({
    Personal: 550,
    Savings: 300,
  });
  expect(computeAccountSnapshotAfter(withAllocation, [beforeMove, afterMove], afterMove.id)?.byPool).toEqual({
    Personal: 630,
    Savings: 200,
  });
});

test('combined live pools exclude templates from unconfigured accounts', () => {
  const unconfiguredCash: BankAccount = {
    ...account,
    id: 'cash',
    bank: 'Cash',
    anchoredAt: null,
    balance: 0,
    minBalance: 0,
    pools: [
      { id: 'cash-personal', name: 'Personal', startingAmount: 0, isAuto: false, isDefault: true },
      { id: 'cash-old', name: 'Previous pool', startingAmount: 0, isAuto: false, isDefault: false },
    ],
  };

  expect(combinePools([account, unconfiguredCash], []).byPool).toEqual({
    Personal: 600,
    Savings: 300,
  });
});

test('historical pool choices exclude pools created later and include pools not yet archived', () => {
  const withHistory: BankAccount = {
    ...account,
    poolHistory: [
      { ...account.pools[0], createdAt: '2026-01-01T00:00:00.000Z' },
      {
        ...account.pools[1],
        createdAt: '2026-01-01T00:00:00.000Z',
        archivedAt: '2026-01-05T00:00:00.000Z',
      },
      {
        id: 'future',
        name: 'New pool',
        startingAmount: 0,
        isAuto: false,
        isDefault: false,
        createdAt: '2026-01-05T00:00:00.000Z',
      },
    ],
  };

  expect(poolNamesAt(withHistory, '2026-01-04T10:00:00.000Z')).toEqual(['Personal', 'Savings']);
  expect(poolNamesAt(withHistory, '2026-01-06T10:00:00.000Z')).toEqual(['Personal', 'New pool']);
});

test('monthly budget transactions exclude earlier months and honor effective spend dates', () => {
  const september: Transaction = {
    ...baseTransaction,
    id: 'september',
    date: '2026-09-30T10:00:00.000Z',
    merchant: 'September purchase',
    amount: 25,
    type: 'Debit',
    pool: 'Personal',
  };
  const october: Transaction = {
    ...baseTransaction,
    id: 'october',
    date: '2026-10-02T10:00:00.000Z',
    merchant: 'October purchase',
    amount: 50,
    type: 'Debit',
    pool: 'Personal',
  };
  const backdatedToSeptember: Transaction = {
    ...baseTransaction,
    id: 'backdated',
    date: '2026-10-02T12:00:00.000Z',
    effectiveDate: '2026-09-30',
    merchant: 'September reimbursement',
    amount: 10,
    type: 'Debit',
    pool: 'Personal',
  };

  expect(transactionsInMonth(
    [september, october, backdatedToSeptember],
    new Date('2026-10-15T12:00:00.000Z')
  )).toEqual([october]);
});
