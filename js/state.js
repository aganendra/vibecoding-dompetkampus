// state.js — store sederhana (pola observer), aksi pengubah data, dan selector turunan.
// State bersifat immutable: setiap perubahan membuat objek baru lalu memberi tahu subscriber.

import { KEYS, load, save } from './storage.js';
import { generateId, currentMonth, normalizeTransactions, normalizeBudgets } from './utils.js';

const DEFAULT_FILTERS = Object.freeze({ search: '', month: '', category: '', type: '', sort: 'date-desc' });

let state = {
  transactions: [],
  budgets: {}, // { 'YYYY-MM': nominal }
  filters: { ...DEFAULT_FILTERS },
  theme: 'light',
};

const listeners = new Set();

export const getState = () => state;

export function subscribe(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function setState(patch) {
  state = { ...state, ...patch };
  listeners.forEach((listener) => listener(state));
}

/* ---------- Inisialisasi dari localStorage ---------- */

// Mengembalikan daftar peringatan (string) untuk ditampilkan sebagai toast
export function initState() {
  const warnings = [];
  const txResult = load(KEYS.transactions, []);
  const budgetResult = load(KEYS.budgets, {});
  const themeResult = load(KEYS.theme, null);

  let transactions = [];
  if (txResult.status === 'ok') {
    if (Array.isArray(txResult.value)) {
      const { items, skipped } = normalizeTransactions(txResult.value);
      transactions = items;
      if (skipped > 0) warnings.push(`${skipped} transaksi rusak diabaikan saat memuat data.`);
    } else {
      warnings.push('Format data tersimpan tidak dikenali, aplikasi dimulai dari data kosong.');
    }
  } else if (txResult.status === 'corrupt') {
    warnings.push('Data tersimpan rusak dan tidak bisa dibaca. Salinan mentahnya diamankan, aplikasi dimulai dari data kosong.');
  } else if (txResult.status === 'unavailable') {
    warnings.push('localStorage tidak tersedia (mungkin mode privat). Data hanya tersimpan sementara.');
  }

  const budgets = budgetResult.status === 'ok' ? normalizeBudgets(budgetResult.value) : {};

  const prefersDark = window.matchMedia?.('(prefers-color-scheme: dark)').matches;
  const theme = themeResult.value === 'dark' || themeResult.value === 'light'
    ? themeResult.value
    : (prefersDark ? 'dark' : 'light');

  state = { ...state, transactions, budgets, theme };
  return warnings;
}

/* ---------- Aksi (semua mengembalikan hasil penyimpanan { ok, reason }) ---------- */

const persistTransactions = () => save(KEYS.transactions, state.transactions);
const persistBudgets = () => save(KEYS.budgets, state.budgets);

export function addTransaction(values) {
  const transaction = { id: generateId(), ...values, createdAt: Date.now() };
  setState({ transactions: [transaction, ...state.transactions] });
  return { ...persistTransactions(), transaction };
}

export function updateTransaction(id, values) {
  if (!state.transactions.some((t) => t.id === id)) return { ok: false, found: false };
  setState({
    transactions: state.transactions.map((t) => (t.id === id ? { ...t, ...values } : t)),
  });
  return { ...persistTransactions(), found: true };
}

export function deleteTransaction(id) {
  setState({ transactions: state.transactions.filter((t) => t.id !== id) });
  return persistTransactions();
}

export function setFilters(patch) {
  setState({ filters: { ...state.filters, ...patch } });
}

export function resetFilters() {
  setState({ filters: { ...DEFAULT_FILTERS } });
}

// amount = null berarti hapus target bulan tersebut
export function setBudget(month, amount) {
  const budgets = { ...state.budgets };
  if (amount === null) delete budgets[month];
  else budgets[month] = amount;
  setState({ budgets });
  return persistBudgets();
}

export function replaceAll({ transactions, budgets }) {
  setState({ transactions, budgets });
  const txSave = persistTransactions();
  return txSave.ok ? persistBudgets() : txSave;
}

export function setTheme(theme) {
  setState({ theme });
  return save(KEYS.theme, theme);
}

/* ---------- Selector (data turunan) ---------- */

const SORTERS = {
  'date-desc': (a, b) => b.date.localeCompare(a.date) || b.createdAt - a.createdAt,
  'date-asc': (a, b) => a.date.localeCompare(b.date) || a.createdAt - b.createdAt,
  'amount-desc': (a, b) => b.amount - a.amount,
  'amount-asc': (a, b) => a.amount - b.amount,
  'title-asc': (a, b) => a.title.localeCompare(b.title, 'id'),
};

// Terapkan filter bulan/kategori/tipe + pencarian, lalu urutkan
export function getVisibleTransactions(s = state) {
  const { search, month, category, type, sort } = s.filters;
  const keyword = search.trim().toLowerCase();

  const filtered = s.transactions.filter((t) =>
    (!month || t.date.startsWith(month)) &&
    (!category || t.category === category) &&
    (!type || t.type === type) &&
    (!keyword ||
      t.title.toLowerCase().includes(keyword) ||
      t.note.toLowerCase().includes(keyword) ||
      t.category.toLowerCase().includes(keyword)),
  );

  return filtered.sort(SORTERS[sort] ?? SORTERS['date-desc']);
}

export function getSummary(transactions) {
  const income = transactions.filter((t) => t.type === 'income').reduce((sum, t) => sum + t.amount, 0);
  const expense = transactions.filter((t) => t.type === 'expense').reduce((sum, t) => sum + t.amount, 0);
  return { income, expense, balance: income - expense };
}

// Total pengeluaran per kategori, diurutkan dari terbesar
export function getCategoryTotals(transactions) {
  const totals = new Map();
  transactions
    .filter((t) => t.type === 'expense')
    .forEach((t) => totals.set(t.category, (totals.get(t.category) ?? 0) + t.amount));

  return [...totals.entries()]
    .map(([label, value]) => ({ label, value }))
    .sort((a, b) => b.value - a.value);
}

// Bulan acuan anggaran: bulan yang sedang difilter, atau bulan berjalan bila filter kosong
export const getBudgetMonth = (s = state) => s.filters.month || currentMonth();

// level: 'none' | 'ok' | 'warning' (>= 80%) | 'over' (melebihi target)
export function getBudgetStatus(s = state, month = getBudgetMonth(s)) {
  const limit = s.budgets[month] ?? null;
  const spent = s.transactions
    .filter((t) => t.type === 'expense' && t.date.startsWith(month))
    .reduce((sum, t) => sum + t.amount, 0);

  if (limit === null) return { month, limit, spent, percent: 0, remaining: null, level: 'none' };

  const ratio = spent / limit;
  const level = spent > limit ? 'over' : ratio >= 0.8 ? 'warning' : 'ok';
  return { month, limit, spent, percent: Math.floor(ratio * 100), remaining: limit - spent, level };
}