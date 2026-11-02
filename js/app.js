// app.js — entry point: inisialisasi, pasang event listener, hubungkan UI dengan state.

import {
  getState, subscribe, initState,
  addTransaction, updateTransaction, deleteTransaction,
  setFilters, resetFilters, setBudget, replaceAll, setTheme,
  getVisibleTransactions, getBudgetStatus, getBudgetMonth,
} from './state.js';
import * as ui from './ui.js';
import {
  formatRupiah, monthLabel, todayISO, debounce, downloadFile,
  validateTransaction, validateAmount, transactionsToCSV, parseImportData,
} from './utils.js';

const MAX_IMPORT_BYTES = 2 * 1024 * 1024; // batas 2 MB agar browser tidak macet

/* ---------- Helper ---------- */

// Beri tahu pengguna bila data gagal tersimpan permanen
function reportSave(result) {
  if (result.ok) return;
  const message = result.reason === 'quota'
    ? 'Penyimpanan browser penuh. Perubahan belum tersimpan permanen, segera ekspor data sebagai cadangan.'
    : 'Perubahan tidak dapat disimpan ke localStorage. Data hanya bertahan selama halaman terbuka.';
  ui.showToast(message, 'error', 8000);
}

// Peringatan anggaran setelah mencatat pengeluaran
function notifyBudget(values) {
  if (values.type !== 'expense') return;
  const status = getBudgetStatus(getState(), values.date.slice(0, 7));
  if (status.level === 'over') {
    ui.showToast(`Anggaran ${monthLabel(status.month)} terlampaui ${formatRupiah(status.spent - status.limit)}!`, 'error', 7000);
  } else if (status.level === 'warning') {
    ui.showToast(`Pengeluaran ${monthLabel(status.month)} sudah ${status.percent}% dari target.`, 'warning', 7000);
  }
}

/* ---------- Transaksi ---------- */

function handleTransactionSubmit(event) {
  event.preventDefault();
  const input = ui.readTransactionForm();
  const { valid, errors, values } = validateTransaction(input);
  ui.showFormErrors(errors);

  if (!valid) {
    ui.showToast('Periksa kembali isian formulir.', 'error');
    return;
  }

  const isEdit = Boolean(input.id);
  const result = isEdit ? updateTransaction(input.id, values) : addTransaction(values);

  if (isEdit && !result.found) {
    ui.showToast('Transaksi yang diubah tidak ditemukan.', 'error');
    ui.resetTransactionForm();
    return;
  }

  reportSave(result);
  ui.showToast(isEdit ? 'Transaksi berhasil diperbarui.' : 'Transaksi berhasil ditambahkan.', 'success');
  ui.resetTransactionForm();
  notifyBudget(values);
}

// Saat tipe diganti, daftar kategori ikut berganti
function handleTransactionFormChange(event) {
  if (event.target.name !== 'type') return;
  ui.updateCategoryOptions(event.target.value, ui.$('tx-category').value);
}

function startEdit(transaction) {
  ui.fillTransactionForm(transaction);
  ui.$('transaction-form').scrollIntoView({ block: 'center' });
  ui.focusElement('tx-title');
}

async function confirmDelete(transaction) {
  const confirmed = await ui.confirmDialog({
    title: 'Hapus transaksi?',
    message: `“${transaction.title}” senilai ${formatRupiah(transaction.amount)} akan dihapus permanen.`,
    confirmText: 'Hapus',
  });
  if (!confirmed) return;

  // Jika transaksi yang sedang diedit dihapus, kosongkan form
  if (ui.readTransactionForm().id === transaction.id) ui.resetTransactionForm();

  reportSave(deleteTransaction(transaction.id));
  ui.showToast('Transaksi dihapus.', 'success');
  ui.focusElement('judul-transaksi'); // tombol yang tadi diklik sudah hilang dari DOM
}

// Event delegation: satu listener untuk semua tombol Edit/Hapus
function handleListClick(event) {
  const button = event.target.closest('button[data-action]');
  if (!button) return;

  const transaction = getState().transactions.find((t) => t.id === button.dataset.id);
  if (!transaction) return;

  if (button.dataset.action === 'edit') startEdit(transaction);
  if (button.dataset.action === 'delete') confirmDelete(transaction);
}

/* ---------- Filter ---------- */

const applySearch = debounce((value) => setFilters({ search: value }), 200);

function handleFilterInput(event) {
  if (event.target.name === 'search') applySearch(event.target.value);
}

function handleFilterChange(event) {
  const { name, value } = event.target;
  if (name && name !== 'search') setFilters({ [name]: value });
}

/* ---------- Anggaran ---------- */

function handleBudgetSubmit(event) {
  event.preventDefault();
  const { error, value } = validateAmount(ui.$('budget-amount').value, 'Target anggaran');
  ui.setFieldError('budget-amount', 'err-budget-amount', error);
  if (error) { ui.focusElement('budget-amount'); return; }

  const month = getBudgetMonth(getState());
  reportSave(setBudget(month, value));
  ui.$('budget-amount').value = '';
  ui.showToast(`Target ${monthLabel(month)} disimpan: ${formatRupiah(value)}.`, 'success');
}

async function handleBudgetClear() {
  const month = getBudgetMonth(getState());
  const confirmed = await ui.confirmDialog({
    title: 'Hapus target anggaran?',
    message: `Target anggaran ${monthLabel(month)} akan dihapus.`,
    confirmText: 'Hapus target',
  });
  if (!confirmed) return;
  reportSave(setBudget(month, null));
  ui.showToast('Target anggaran dihapus.', 'success');
}

/* ---------- Tema ---------- */

function handleThemeToggle() {
  reportSave(setTheme(getState().theme === 'dark' ? 'light' : 'dark'));
}

/* ---------- Export / Import ---------- */

function exportJSON() {
  const { transactions, budgets } = getState();
  if (transactions.length === 0 && Object.keys(budgets).length === 0) {
    ui.showToast('Belum ada data untuk diekspor.', 'warning');
    return;
  }
  const payload = {
    app: 'dompet-kampus',
    version: 1,
    exportedAt: new Date().toISOString(),
    transactions,
    budgets,
  };
  downloadFile(`dompet-kampus-${todayISO()}.json`, JSON.stringify(payload, null, 2), 'application/json');
  ui.showToast('Data berhasil diekspor (JSON).', 'success');
}

function exportCSV() {
  const visible = getVisibleTransactions(getState());
  if (visible.length === 0) {
    ui.showToast('Tidak ada transaksi pada filter saat ini untuk diekspor.', 'warning');
    return;
  }
  // BOM (\uFEFF) agar Excel membaca UTF-8 dengan benar
  downloadFile(`transaksi-${todayISO()}.csv`, `\uFEFF${transactionsToCSV(visible)}`, 'text/csv;charset=utf-8');
  ui.showToast(`${visible.length} transaksi diekspor (CSV).`, 'success');
}

async function handleImport(event) {
  const file = event.target.files[0];
  event.target.value = ''; // reset agar file yang sama bisa dipilih ulang
  if (!file) return;

  if (file.size > MAX_IMPORT_BYTES) {
    ui.showToast('File terlalu besar (maksimal 2 MB).', 'error');
    return;
  }

  try {
    const parsed = parseImportData(await file.text());
    const skippedNote = parsed.skipped > 0 ? ` (${parsed.skipped} data tidak valid dilewati)` : '';
    const confirmed = await ui.confirmDialog({
      title: 'Impor data?',
      message: `Data saat ini (${getState().transactions.length} transaksi) akan DIGANTI dengan ${parsed.transactions.length} transaksi dari file${skippedNote}.`,
      confirmText: 'Ganti data',
      danger: false,
    });
    if (!confirmed) return;

    reportSave(replaceAll({ transactions: parsed.transactions, budgets: parsed.budgets }));
    ui.resetTransactionForm();
    ui.showToast(`Impor berhasil: ${parsed.transactions.length} transaksi dimuat.`, 'success');
  } catch (error) {
    ui.showToast(error.message || 'Gagal membaca file.', 'error', 7000);
  }
}

/* ---------- Menu Data ---------- */

function handleMenuClick(event) {
  const item = event.target.closest('button[data-menu-action]');
  if (!item) return;
  ui.$('data-menu').open = false;

  const actions = {
    'export-json': exportJSON,
    'export-csv': exportCSV,
    'import-json': () => ui.$('import-file').click(),
  };
  actions[item.dataset.menuAction]?.();
}

// Tutup menu saat klik di luar atau menekan Escape
function setupMenuDismiss() {
  document.addEventListener('click', (event) => {
    const menu = ui.$('data-menu');
    if (menu.open && !menu.contains(event.target)) menu.open = false;
  });
  document.addEventListener('keydown', (event) => {
    const menu = ui.$('data-menu');
    if (event.key === 'Escape' && menu.open) {
      menu.open = false;
      menu.querySelector('summary').focus();
    }
  });
}

/* ---------- Inisialisasi ---------- */

function bindEvents() {
  ui.on('transaction-form', 'submit', handleTransactionSubmit);
  ui.on('transaction-form', 'change', handleTransactionFormChange);
  ui.on('tx-cancel', 'click', ui.resetTransactionForm);
  ui.on('transaction-list', 'click', handleListClick);

  ui.on('filter-form', 'input', handleFilterInput);
  ui.on('filter-form', 'change', handleFilterChange);
  ui.on('filter-form', 'submit', (event) => event.preventDefault());
  ui.on('btn-reset-filters', 'click', resetFilters);

  ui.on('budget-form', 'submit', handleBudgetSubmit);
  ui.on('btn-budget-clear', 'click', handleBudgetClear);

  ui.on('btn-theme', 'click', handleThemeToggle);
  ui.on('data-menu', 'click', handleMenuClick);
  ui.on('import-file', 'change', handleImport);
  setupMenuDismiss();

  // Gambar ulang grafik saat ukuran layar berubah
  window.addEventListener('resize', debounce(ui.redrawChart, 150));
}

function init() {
  const warnings = initState();
  ui.initUI();
  subscribe(ui.renderAll);
  ui.renderAll(getState());
  bindEvents();
  warnings.forEach((message) => ui.showToast(message, 'warning', 9000));

  // Penanda bahwa modul berhasil dimuat (dibaca skrip di index.html untuk menyembunyikan banner)
  document.documentElement.setAttribute('data-app-ready', '');
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
else init();