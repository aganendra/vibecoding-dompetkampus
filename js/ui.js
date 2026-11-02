// ui.js — semua manipulasi DOM. Data milik pengguna SELALU lewat textContent (anti-XSS);
// innerHTML tidak dipakai sama sekali.

import { formatRupiah, formatDate, monthLabel, todayISO, CATEGORIES, ALL_CATEGORIES, TYPE_LABELS } from './utils.js';
import { getVisibleTransactions, getSummary, getCategoryTotals, getBudgetStatus } from './state.js';
import { drawBarChart } from './chart.js';

export const $ = (id) => document.getElementById(id);

export function on(id, eventName, handler) {
  $(id).addEventListener(eventName, handler);
}

/** Pembuat elemen kecil: el('p', { className, text, attrs, dataset }, [anak...]) */
function el(tag, { className, text, attrs = {}, dataset = {} } = {}, children = []) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  Object.entries(attrs).forEach(([key, value]) => node.setAttribute(key, value));
  Object.entries(dataset).forEach(([key, value]) => { node.dataset[key] = value; });
  node.append(...children);
  return node;
}

let chartData = []; // data terakhir, dipakai untuk menggambar ulang saat resize

/* ================= Render utama ================= */

export function renderAll(state) {
  const visible = getVisibleTransactions(state);
  renderTheme(state); // tema dulu, karena grafik membaca warna dari CSS variable
  renderSummary(state, visible);
  renderBudget(state);
  renderChart(visible);
  renderFilters(state);
  renderList(state, visible);
}

export function initUI() {
  // Isi dropdown filter kategori (sekali saja)
  const select = $('filter-category');
  select.append(el('option', { text: 'Semua kategori', attrs: { value: '' } }));
  ALL_CATEGORIES.forEach((name) => select.append(el('option', { text: name, attrs: { value: name } })));
  resetTransactionForm();
}

/* ================= Tema ================= */

function renderTheme(state) {
  const isDark = state.theme === 'dark';
  document.documentElement.setAttribute('data-theme', state.theme);
  $('btn-theme').setAttribute('aria-pressed', String(isDark));
  $('theme-label').textContent = isDark ? 'Mode terang' : 'Mode gelap';
  $('theme-icon').textContent = isDark ? '☀️' : '🌙';
}

/* ================= Ringkasan ================= */

function describeScope(filters) {
  const parts = [filters.month ? monthLabel(filters.month) : 'Semua periode'];
  if (filters.category) parts.push(filters.category);
  if (filters.type) parts.push(TYPE_LABELS[filters.type]);
  if (filters.search.trim()) parts.push(`pencarian “${filters.search.trim()}”`);
  return parts.join(' · ');
}

function renderSummary(state, visible) {
  const { income, expense, balance } = getSummary(visible);
  $('sum-balance').textContent = formatRupiah(balance);
  $('sum-balance').classList.toggle('is-negative', balance < 0);
  $('sum-income').textContent = formatRupiah(income);
  $('sum-expense').textContent = formatRupiah(expense);
  $('summary-scope').textContent = `${describeScope(state.filters)} · ${visible.length} transaksi`;
}

/* ================= Anggaran ================= */

const BUDGET_MESSAGES = {
  ok: (s) => `Aman. Sisa anggaran ${formatRupiah(s.remaining)}.`,
  warning: (s) => `Hati-hati! Pengeluaran sudah ${s.percent}% dari target. Sisa ${formatRupiah(s.remaining)}.`,
  over: (s) => `Peringatan: anggaran terlampaui ${formatRupiah(s.spent - s.limit)}.`,
};

function renderBudget(state) {
  const status = getBudgetStatus(state);
  const hasBudget = status.limit !== null;

  $('budget-month').textContent = `Bulan: ${monthLabel(status.month)}`;
  $('budget-amount').placeholder = hasBudget ? `Saat ini ${status.limit}` : 'Contoh: 1500000';
  $('btn-budget-clear').disabled = !hasBudget;
  $('budget-empty').hidden = hasBudget;
  $('budget-progress-wrap').hidden = !hasBudget;
  if (!hasBudget) return;

  const barPercent = Math.min(100, status.percent);
  const bar = $('budget-bar');
  bar.style.width = `${barPercent}%`;
  bar.className = `progress__bar progress__bar--${status.level}`;
  $('budget-progress').setAttribute('aria-valuenow', String(barPercent));

  $('budget-text').textContent = `${formatRupiah(status.spent)} dari ${formatRupiah(status.limit)} (${status.percent}%)`;

  const alertBox = $('budget-alert');
  alertBox.className = `alert alert--${status.level}`;
  alertBox.textContent = BUDGET_MESSAGES[status.level](status);
}

/* ================= Grafik ================= */

function renderChart(visible) {
  chartData = getCategoryTotals(visible);
  const hasData = chartData.length > 0;
  $('chart-canvas').hidden = !hasData;
  $('chart-empty').hidden = hasData;
  if (!hasData) return;

  const summary = chartData.map((item) => `${item.label} ${formatRupiah(item.value)}`).join(', ');
  $('chart-canvas').setAttribute('aria-label', `Grafik batang pengeluaran per kategori: ${summary}`);
  redrawChart();
}

export function redrawChart() {
  if (chartData.length === 0) return;
  drawBarChart($('chart-canvas'), chartData, { formatValue: formatRupiah });
}

/* ================= Filter ================= */

// Sinkronkan input filter dengan state (mis. setelah "Reset filter"); input yang sama tidak disentuh
function renderFilters(state) {
  [
    ['filter-search', 'search'],
    ['filter-month', 'month'],
    ['filter-category', 'category'],
    ['filter-type', 'type'],
    ['filter-sort', 'sort'],
  ].forEach(([id, key]) => {
    const input = $(id);
    if (input.value !== state.filters[key]) input.value = state.filters[key];
  });
}

/* ================= Daftar transaksi ================= */

function createTransactionItem(transaction) {
  const isIncome = transaction.type === 'income';

  const info = el('div', {}, [
    el('p', { className: 'tx__title', text: transaction.title }),
    el('p', { className: 'tx__meta', text: `${transaction.category} · ${formatDate(transaction.date)}` }),
  ]);
  if (transaction.note) info.append(el('p', { className: 'tx__note', text: transaction.note }));

  // Teks tersembunyi untuk pembaca layar, agar tipe tidak hanya dibedakan lewat warna
  const amount = el('p', { className: 'tx__amount' }, [
    el('span', { className: 'sr-only', text: `${TYPE_LABELS[transaction.type]} ` }),
    document.createTextNode(`${isIncome ? '+' : '−'} ${formatRupiah(transaction.amount)}`),
  ]);

  const actions = el('div', { className: 'tx__actions' }, [
    el('button', {
      className: 'btn btn-ghost btn-sm',
      text: 'Edit',
      attrs: { type: 'button', 'aria-label': `Edit transaksi ${transaction.title}` },
      dataset: { action: 'edit', id: transaction.id },
    }),
    el('button', {
      className: 'btn btn-danger-ghost btn-sm',
      text: 'Hapus',
      attrs: { type: 'button', 'aria-label': `Hapus transaksi ${transaction.title}` },
      dataset: { action: 'delete', id: transaction.id },
    }),
  ]);

  return el('li', { className: `tx tx--${transaction.type}` }, [info, amount, actions]);
}

function renderList(state, visible) {
  const list = $('transaction-list');
  const empty = $('list-empty');
  list.replaceChildren();

  $('list-count').textContent = `${visible.length} dari ${state.transactions.length} transaksi`;

  if (visible.length === 0) {
    const noData = state.transactions.length === 0;
    $('empty-title').textContent = noData ? 'Belum ada transaksi' : 'Tidak ada transaksi yang cocok';
    $('empty-text').textContent = noData
      ? 'Mulai dengan mengisi formulir di atas, atau impor data dari file JSON.'
      : 'Coba ubah kata kunci pencarian atau klik "Reset filter".';
    empty.hidden = false;
    return;
  }

  empty.hidden = true;
  list.append(...visible.map(createTransactionItem));
}

/* ================= Form transaksi ================= */

const FIELD_MAP = [
  ['title', 'tx-title', 'err-title'],
  ['amount', 'tx-amount', 'err-amount'],
  ['category', 'tx-category', 'err-category'],
  ['date', 'tx-date', 'err-date'],
  ['note', 'tx-note', 'err-note'],
];

const formField = (name) => $('transaction-form').elements.namedItem(name);

// Opsi kategori mengikuti tipe transaksi (pemasukan vs pengeluaran)
export function updateCategoryOptions(type, selected = '') {
  const select = $('tx-category');
  const options = CATEGORIES[type] ?? [];
  select.replaceChildren(el('option', { text: 'Pilih kategori', attrs: { value: '' } }));
  options.forEach((name) => select.append(el('option', { text: name, attrs: { value: name } })));
  select.value = options.includes(selected) ? selected : '';
}

function setFormMode(isEdit) {
  $('form-title').textContent = isEdit ? 'Ubah transaksi' : 'Tambah transaksi';
  $('tx-submit').textContent = isEdit ? 'Simpan perubahan' : 'Simpan transaksi';
  $('tx-cancel').hidden = !isEdit;
}

export function readTransactionForm() {
  const data = new FormData($('transaction-form'));
  return {
    id: data.get('id'),
    type: data.get('type'),
    title: data.get('title'),
    amount: data.get('amount'),
    category: data.get('category'),
    date: data.get('date'),
    note: data.get('note'),
  };
}

export function fillTransactionForm(transaction) {
  formField('id').value = transaction.id;
  formField('type').value = transaction.type; // RadioNodeList: memilih radio yang cocok
  updateCategoryOptions(transaction.type, transaction.category);
  formField('title').value = transaction.title;
  formField('amount').value = String(transaction.amount);
  formField('date').value = transaction.date;
  formField('note').value = transaction.note;
  showFormErrors({});
  setFormMode(true);
}

export function resetTransactionForm() {
  $('transaction-form').reset();
  formField('date').value = todayISO();
  updateCategoryOptions('expense');
  showFormErrors({});
  setFormMode(false);
}

export function setFieldError(inputId, errorId, message) {
  $(errorId).textContent = message || '';
  if (message) $(inputId).setAttribute('aria-invalid', 'true');
  else $(inputId).removeAttribute('aria-invalid');
}

// Tampilkan pesan error per field, lalu fokus ke field pertama yang bermasalah
export function showFormErrors(errors) {
  let firstInvalid = null;
  FIELD_MAP.forEach(([name, inputId, errorId]) => {
    setFieldError(inputId, errorId, errors[name]);
    if (errors[name] && !firstInvalid) firstInvalid = $(inputId);
  });
  firstInvalid?.focus();
}

export function focusElement(id) {
  $(id).focus();
}

/* ================= Toast & dialog ================= */

export function showToast(message, type = 'info', duration = 4500) {
  const toast = el('div', { className: `toast toast--${type}`, text: message });
  $('toast-container').append(toast);
  setTimeout(() => toast.remove(), duration);
}

/** Dialog konfirmasi berbasis <dialog>. Mengembalikan Promise<boolean>. */
export function confirmDialog({ title, message, confirmText = 'Ya', danger = true }) {
  const dialog = $('confirm-dialog');

  // Cadangan untuk browser lama yang belum mendukung <dialog>
  if (typeof dialog.showModal !== 'function') {
    return Promise.resolve(window.confirm(`${title}\n\n${message}`));
  }

  $('dialog-title').textContent = title;
  $('dialog-message').textContent = message;
  const confirmButton = $('dialog-confirm');
  confirmButton.textContent = confirmText;
  confirmButton.className = `btn ${danger ? 'btn-danger' : 'btn-primary'}`;

  return new Promise((resolve) => {
    const handleClose = () => {
      dialog.removeEventListener('close', handleClose);
      resolve(dialog.returnValue === 'confirm');
    };
    dialog.addEventListener('close', handleClose);
    dialog.returnValue = '';
    dialog.showModal(); // tombol "Batal" mendapat fokus awal (aman untuk aksi destruktif)
  });
}