// utils.js — fungsi murni: format, validasi, CSV, normalisasi data impor.

export const CATEGORIES = Object.freeze({
  expense: ['Makanan', 'Transportasi', 'Pendidikan', 'Hiburan', 'Belanja', 'Kesehatan', 'Tagihan', 'Lainnya'],
  income: ['Uang Saku', 'Beasiswa', 'Gaji/Freelance', 'Hadiah', 'Lainnya'],
});

// Gabungan kategori unik (untuk dropdown filter)
export const ALL_CATEGORIES = [...new Set([...CATEGORIES.expense, ...CATEGORIES.income])];

export const LIMITS = Object.freeze({
  titleMin: 2,
  titleMax: 60,
  noteMax: 200,
  amountMax: 999_999_999_999,
});

export const TYPE_LABELS = Object.freeze({ income: 'Pemasukan', expense: 'Pengeluaran' });

/* ---------- Format ---------- */

const rupiahFormatter = new Intl.NumberFormat('id-ID', {
  style: 'currency',
  currency: 'IDR',
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

export function formatRupiah(value) {
  return rupiahFormatter.format(Number.isFinite(value) ? value : 0);
}

const dateFormatter = new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });
const monthFormatter = new Intl.DateTimeFormat('id-ID', { month: 'long', year: 'numeric' });

const pad = (n) => String(n).padStart(2, '0');

// Tanggal "YYYY-MM-DD" diurai manual agar tidak bergeser karena zona waktu (UTC vs lokal)
export function formatDate(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return dateFormatter.format(new Date(y, m - 1, d));
}

export function monthLabel(yearMonth) {
  const [y, m] = yearMonth.split('-').map(Number);
  return monthFormatter.format(new Date(y, m - 1, 1));
}

export function todayISO() {
  const now = new Date();
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

export const currentMonth = () => todayISO().slice(0, 7);

export function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

export function debounce(fn, delay = 200) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  };
}

/* ---------- Validasi ---------- */

export function isValidISODate(text) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return false;
  const [y, m, d] = text.split('-').map(Number);
  if (y < 2000 || y > 2100) return false;
  // Cek balik: 2026-02-31 akan "bergeser" ke Maret sehingga ditolak
  const date = new Date(y, m - 1, d);
  return date.getFullYear() === y && date.getMonth() === m - 1 && date.getDate() === d;
}

// Mengembalikan { error } atau { value }
export function validateAmount(raw, label = 'Nominal') {
  const text = String(raw ?? '').trim();
  if (text === '') return { error: `${label} wajib diisi.` };

  const number = Number(text);
  if (!Number.isFinite(number)) return { error: `${label} harus berupa angka.` };
  if (!Number.isInteger(number)) return { error: `${label} harus bilangan bulat (tanpa desimal).` };
  if (number <= 0) return { error: `${label} harus lebih dari 0.` };
  if (number > LIMITS.amountMax) {
    return { error: `${label} terlalu besar (maksimal ${formatRupiah(LIMITS.amountMax)}).` };
  }
  return { value: number };
}

// Validasi + pembersihan input form. `values` hanya dipakai bila valid.
export function validateTransaction(input) {
  const errors = {};

  const type = input.type === 'income' || input.type === 'expense' ? input.type : null;
  if (!type) errors.type = 'Pilih tipe transaksi.';

  const title = String(input.title ?? '').trim().replace(/\s+/g, ' ');
  if (title.length < LIMITS.titleMin) errors.title = `Judul minimal ${LIMITS.titleMin} karakter.`;
  else if (title.length > LIMITS.titleMax) errors.title = `Judul maksimal ${LIMITS.titleMax} karakter.`;

  const amountResult = validateAmount(input.amount, 'Nominal');
  if (amountResult.error) errors.amount = amountResult.error;

  const category = String(input.category ?? '').trim();
  if (!category) errors.category = 'Pilih kategori terlebih dahulu.';
  else if (type && !CATEGORIES[type].includes(category)) errors.category = 'Kategori tidak sesuai dengan tipe transaksi.';

  const date = String(input.date ?? '').trim();
  if (!date) errors.date = 'Tanggal wajib diisi.';
  else if (!isValidISODate(date)) errors.date = 'Tanggal tidak valid.';

  const note = String(input.note ?? '').trim();
  if (note.length > LIMITS.noteMax) errors.note = `Catatan maksimal ${LIMITS.noteMax} karakter.`;

  return {
    valid: Object.keys(errors).length === 0,
    errors,
    values: { type, title, amount: amountResult.value, category, date, note },
  };
}

/* ---------- Normalisasi data dari localStorage / file impor ---------- */

// Mengembalikan objek transaksi bersih, atau null bila data tidak layak dipakai
export function normalizeTransaction(raw) {
  if (!raw || typeof raw !== 'object' || typeof raw.title !== 'string') return null;

  const allowed = CATEGORIES[raw.type];
  if (!allowed) return null;

  // Kategori asing dipetakan ke "Lainnya" agar data lama tidak terbuang
  const category = allowed.includes(raw.category) ? raw.category : 'Lainnya';
  const { valid, values } = validateTransaction({ ...raw, category });
  if (!valid) return null;

  return {
    id: typeof raw.id === 'string' && raw.id ? raw.id : generateId(),
    ...values,
    createdAt: Number.isFinite(raw.createdAt) ? raw.createdAt : Date.now(),
  };
}

export function normalizeTransactions(list) {
  const seenIds = new Set();
  const items = [];
  let skipped = 0;

  list.forEach((raw) => {
    const item = normalizeTransaction(raw);
    if (!item) { skipped += 1; return; }
    if (seenIds.has(item.id)) item.id = generateId(); // hindari id kembar
    seenIds.add(item.id);
    items.push(item);
  });

  return { items, skipped };
}

export function normalizeBudgets(raw) {
  const result = {};
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return result;

  Object.entries(raw).forEach(([month, amount]) => {
    const validMonth = /^\d{4}-(0[1-9]|1[0-2])$/.test(month);
    const { value } = validateAmount(amount, 'Anggaran');
    if (validMonth && value) result[month] = value;
  });
  return result;
}

// Mengurai teks file JSON impor. Melempar Error berpesan ramah bila tidak valid.
export function parseImportData(text) {
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error('File bukan JSON yang valid.');
  }

  const rawList = Array.isArray(data) ? data : data?.transactions;
  if (!Array.isArray(rawList)) {
    throw new Error('Struktur file tidak dikenali: daftar "transactions" tidak ditemukan.');
  }

  const { items, skipped } = normalizeTransactions(rawList);
  if (items.length === 0 && skipped > 0) {
    throw new Error('Tidak ada transaksi yang valid di dalam file.');
  }

  const budgets = Array.isArray(data) ? {} : normalizeBudgets(data.budgets);
  return { transactions: items, budgets, skipped };
}

/* ---------- Export ---------- */

function csvCell(value) {
  let text = String(value ?? '');
  // Cegah CSV injection: sel diawali = + - @ akan dianggap rumus oleh Excel
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function transactionsToCSV(transactions) {
  const header = ['Tanggal', 'Tipe', 'Judul', 'Kategori', 'Nominal', 'Catatan'];
  const rows = transactions.map((t) => [t.date, TYPE_LABELS[t.type], t.title, t.category, t.amount, t.note]);
  return [header, ...rows].map((row) => row.map(csvCell).join(',')).join('\r\n');
}

export function downloadFile(filename, content, mimeType) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}