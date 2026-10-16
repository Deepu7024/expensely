import { Source, Transaction } from './types';

// VITE_API_BASE_URL is inlined at build time. `/api` uses the local
// development proxy; deployments should set their full HTTPS API URL from a
// local environment file or the hosting provider's environment settings.
export const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL ?? '/api';

export const MONTHLY_BUDGET_DEFAULT = 45000;

export const SOURCES: Source[] = ['SMS', 'Cash', 'PhonePe', 'Email'];

/**
 * Bank options for the Bank Accounts picker — a label only (shown in the
 * UI next to the sender address), doesn't affect classification/
 * extraction. "Other" covers anything not listed, with a free-text address
 * either way.
 */
export const BANK_OPTIONS: string[] = [
  'HDFC Bank',
  'ICICI Bank',
  'State Bank of India',
  'Axis Bank',
  'Kotak Mahindra Bank',
  'Punjab National Bank',
  'Bank of Baroda',
  'Yes Bank',
  'IDFC FIRST Bank',
  'IndusInd Bank',
  'Other',
];

/**
 * Known style per category name — covers the built-in default set. A
 * custom category a user adds isn't in this map, so every lookup below
 * goes through the two helper functions instead of indexing directly;
 * they fall back to a neutral zinc style for anything not listed here.
 */
const CATEGORY_STYLES: Record<string, string> = {
  'Food & Dining': 'bg-orange-500/10 text-orange-300 ring-orange-500/25',
  Entertainment: 'bg-fuchsia-500/10 text-fuchsia-300 ring-fuchsia-500/25',
  Shopping: 'bg-sky-500/10 text-sky-300 ring-sky-500/25',
  Utilities: 'bg-amber-500/10 text-amber-300 ring-amber-500/25',
  Groceries: 'bg-lime-500/10 text-lime-300 ring-lime-500/25',
  Travel: 'bg-indigo-500/10 text-indigo-300 ring-indigo-500/25',
  Health: 'bg-rose-500/10 text-rose-300 ring-rose-500/25',
  Business: 'bg-cyan-500/10 text-cyan-300 ring-cyan-500/25',
  Personal: 'bg-emerald-500/10 text-emerald-300 ring-emerald-500/25',
  Other: 'bg-zinc-500/10 text-zinc-300 ring-zinc-500/25',
};

/** Solid dot color per category, for compact indicators (e.g. the category picker menu). */
const CATEGORY_DOT: Record<string, string> = {
  'Food & Dining': 'bg-orange-400',
  Entertainment: 'bg-fuchsia-400',
  Shopping: 'bg-sky-400',
  Utilities: 'bg-amber-400',
  Groceries: 'bg-lime-400',
  Travel: 'bg-indigo-400',
  Health: 'bg-rose-400',
  Business: 'bg-cyan-400',
  Personal: 'bg-emerald-400',
  Other: 'bg-zinc-400',
};

const FALLBACK_CATEGORY_STYLE = 'bg-violet-500/10 text-violet-300 ring-violet-500/25';
const FALLBACK_CATEGORY_DOT = 'bg-violet-400';

export function categoryBadgeClass(category: string): string {
  return CATEGORY_STYLES[category] ?? FALLBACK_CATEGORY_STYLE;
}

export function categoryDotClass(category: string): string {
  return CATEGORY_DOT[category] ?? FALLBACK_CATEGORY_DOT;
}

const FALLBACK_CATEGORY_BAR = 'bg-violet-400';
const CATEGORY_BAR: Record<string, string> = CATEGORY_DOT;

export function categoryBarClass(category: string): string {
  return CATEGORY_BAR[category] ?? FALLBACK_CATEGORY_BAR;
}

/**
 * Colors for pool tiles/segments/badges (Personal, Business, Savings, or
 * any custom split a user names) — unlike categories, pool names aren't a
 * fixed set worth hand-curating, so this hashes the name into a small
 * fixed palette instead. Deterministic (same name always gets the same
 * color) but otherwise arbitrary — a custom pool's color isn't meaningful,
 * just consistent.
 */
const POOL_PALETTE: { bar: string; dot: string; icon: string; text: string; bg: string; ring: string }[] = [
  { bar: 'bg-emerald-400', dot: 'bg-emerald-400', icon: 'text-emerald-400', text: 'text-emerald-300', bg: 'bg-emerald-500/15', ring: 'ring-emerald-500/30' },
  { bar: 'bg-cyan-400', dot: 'bg-cyan-400', icon: 'text-cyan-400', text: 'text-cyan-300', bg: 'bg-cyan-500/15', ring: 'ring-cyan-500/30' },
  { bar: 'bg-yellow-400', dot: 'bg-yellow-400', icon: 'text-yellow-400', text: 'text-yellow-300', bg: 'bg-yellow-500/15', ring: 'ring-yellow-500/30' },
  { bar: 'bg-sky-400', dot: 'bg-sky-400', icon: 'text-sky-400', text: 'text-sky-300', bg: 'bg-sky-500/15', ring: 'ring-sky-500/30' },
  { bar: 'bg-fuchsia-400', dot: 'bg-fuchsia-400', icon: 'text-fuchsia-400', text: 'text-fuchsia-300', bg: 'bg-fuchsia-500/15', ring: 'ring-fuchsia-500/30' },
  { bar: 'bg-lime-400', dot: 'bg-lime-400', icon: 'text-lime-400', text: 'text-lime-300', bg: 'bg-lime-500/15', ring: 'ring-lime-500/30' },
  { bar: 'bg-rose-400', dot: 'bg-rose-400', icon: 'text-rose-400', text: 'text-rose-300', bg: 'bg-rose-500/15', ring: 'ring-rose-500/30' },
  { bar: 'bg-violet-400', dot: 'bg-violet-400', icon: 'text-violet-400', text: 'text-violet-300', bg: 'bg-violet-500/15', ring: 'ring-violet-500/30' },
];

// Reserve fixed slots for the common default pools, picked to be far
// apart on the color wheel (bright yellow / purple / blue) rather than
// adjacent hues that read as near-identical at a glance (cyan and sky
// both being "light blue" was a previous bug) — everything else (a
// custom pool a user names) is hashed into whatever's left of the
// palette.
const NAMED_POOL_INDEX: Record<string, number> = {
  Personal: 2, // yellow (bright)
  Business: 7, // violet
  Savings: 3, // sky (blue)
};

const UNRESERVED_POOL_INDICES = POOL_PALETTE.map((_, i) => i).filter(
  (i) => !Object.values(NAMED_POOL_INDEX).includes(i)
);

function poolPaletteIndex(name: string): number {
  if (name in NAMED_POOL_INDEX) return NAMED_POOL_INDEX[name];
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) | 0;
  // Skip the reserved slots so a custom pool doesn't quietly land on the
  // same color as Personal/Business/Savings either.
  return UNRESERVED_POOL_INDICES[Math.abs(hash) % UNRESERVED_POOL_INDICES.length];
}

function poolPalette(name: string) {
  return POOL_PALETTE[poolPaletteIndex(name)];
}

export function poolBarClass(name: string): string {
  return poolPalette(name).bar;
}

export function poolDotClass(name: string): string {
  return poolPalette(name).dot;
}

/** Icon color for a pool tile, matching its dot/bar color. */
export function poolIconClass(name: string): string {
  return poolPalette(name).icon;
}

/** Pill/badge classes for a pool tag (background + text + ring), e.g. the per-transaction pool picker. */
export function poolBadgeClass(name: string): string {
  const p = poolPalette(name);
  return `${p.bg} ${p.text} ${p.ring}`;
}

/**
 * Demo/seed data. Used only as a fallback so the dashboard still renders
 * something meaningful when the placeholder API_BASE_URL can't be reached
 * (e.g. during local development, before a real backend is deployed).
 */
export const SEED_TRANSACTIONS: Transaction[] = [
  {
    id: 'tx_1',
    accountId: 'seed',
    merchant: 'Blue Tokai Coffee',
    category: 'Food & Dining',
    amount: 640,
    date: '2026-08-19T09:12:00.000Z',
    source: 'PhonePe',
    type: 'Debit',
    pool: 'Personal',
    isSplit: false,
    isAllocated: false,
  },
  {
    id: 'tx_2',
    accountId: 'seed',
    merchant: 'Netflix',
    category: 'Entertainment',
    amount: 649,
    date: '2026-08-18T00:00:00.000Z',
    source: 'SMS',
    type: 'Debit',
    pool: 'Personal',
    isSplit: true,
    isAllocated: false,
    shareAmount: 325,
  },
  {
    id: 'tx_3',
    accountId: 'seed',
    merchant: 'AWS',
    category: 'Business',
    amount: 4820,
    date: '2026-08-17T14:30:00.000Z',
    source: 'SMS',
    type: 'Debit',
    pool: 'Business',
    isSplit: false,
    isAllocated: false,
  },
  {
    id: 'tx_4',
    accountId: 'seed',
    merchant: 'Local Kirana Store',
    category: 'Groceries',
    amount: 1120,
    date: '2026-08-17T11:00:00.000Z',
    source: 'Cash',
    type: 'Debit',
    pool: 'Personal',
    isSplit: false,
    isAllocated: false,
  },
  {
    id: 'tx_5',
    accountId: 'seed',
    merchant: 'Transfer to Savings',
    category: 'Personal',
    amount: 15000,
    date: '2026-08-16T08:00:00.000Z',
    source: 'PhonePe',
    type: 'Debit',
    pool: 'Savings',
    isSplit: false,
    isAllocated: false,
  },
  {
    id: 'tx_6',
    accountId: 'seed',
    merchant: 'Zomato',
    category: 'Food & Dining',
    amount: 480,
    date: '2026-08-15T20:15:00.000Z',
    source: 'SMS',
    type: 'Debit',
    pool: 'Personal',
    isSplit: false,
    isAllocated: false,
  },
  {
    id: 'tx_7',
    accountId: 'seed',
    merchant: 'H&M',
    category: 'Shopping',
    amount: 2799,
    date: '2026-08-14T17:45:00.000Z',
    source: 'SMS',
    type: 'Debit',
    pool: 'Personal',
    isSplit: false,
    isAllocated: false,
  },
  {
    id: 'tx_8',
    accountId: 'seed',
    merchant: 'Indian Oil Petrol Pump',
    category: 'Travel',
    amount: 1500,
    date: '2026-08-13T07:30:00.000Z',
    source: 'Cash',
    type: 'Debit',
    pool: 'Personal',
    isSplit: false,
    isAllocated: false,
  },
  {
    id: 'tx_9',
    accountId: 'seed',
    merchant: 'Notion',
    category: 'Business',
    amount: 799,
    date: '2026-08-12T00:00:00.000Z',
    source: 'SMS',
    type: 'Debit',
    pool: 'Business',
    isSplit: false,
    isAllocated: false,
  },
  {
    id: 'tx_10',
    accountId: 'seed',
    merchant: 'Apollo Pharmacy',
    category: 'Health',
    amount: 340,
    date: '2026-08-11T18:20:00.000Z',
    source: 'PhonePe',
    type: 'Debit',
    pool: 'Personal',
    isSplit: false,
    isAllocated: false,
  },
  {
    id: 'tx_11',
    accountId: 'seed',
    merchant: 'BESCOM Electricity',
    category: 'Utilities',
    amount: 2150,
    date: '2026-08-10T00:00:00.000Z',
    source: 'SMS',
    type: 'Debit',
    pool: 'Personal',
    isSplit: false,
    isAllocated: false,
  },
  {
    id: 'tx_12',
    accountId: 'seed',
    merchant: 'PVR Cinemas',
    category: 'Entertainment',
    amount: 960,
    date: '2026-08-09T21:00:00.000Z',
    source: 'PhonePe',
    type: 'Debit',
    pool: 'Personal',
    isSplit: true,
    isAllocated: false,
    shareAmount: 480,
  },
];
