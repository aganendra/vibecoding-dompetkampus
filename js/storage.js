// storage.js — pembungkus localStorage. Semua akses dibungkus try/catch
// karena localStorage bisa tidak tersedia (mode privat), penuh, atau berisi data rusak.

export const KEYS = Object.freeze({
  transactions: 'dompetKampus.transactions',
  budgets: 'dompetKampus.budgets',
  theme: 'dompetKampus.theme',
});

function isQuotaError(error) {
  return error instanceof DOMException && (
    error.name === 'QuotaExceededError' ||
    error.name === 'NS_ERROR_DOM_QUOTA_REACHED' ||
    error.code === 22 ||
    error.code === 1014
  );
}

// Simpan salinan mentah data rusak agar tidak hilang total
function backupCorruptData(key, raw) {
  try {
    localStorage.setItem(`${key}.corrupt`, raw);
  } catch {
    /* penyimpanan penuh: abaikan, cadangan hanya bonus */
  }
}

/**
 * Membaca & mengurai JSON.
 * status: 'ok' | 'empty' (belum ada data) | 'corrupt' (JSON rusak) | 'unavailable'
 */
export function load(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    if (raw === null) return { value: fallback, status: 'empty' };

    try {
      return { value: JSON.parse(raw), status: 'ok' };
    } catch {
      backupCorruptData(key, raw);
      return { value: fallback, status: 'corrupt' };
    }
  } catch {
    return { value: fallback, status: 'unavailable' };
  }
}

/** Menyimpan sebagai JSON. Mengembalikan { ok } atau { ok: false, reason: 'quota' | 'unavailable' }. */
export function save(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return { ok: true };
  } catch (error) {
    return { ok: false, reason: isQuotaError(error) ? 'quota' : 'unavailable' };
  }
}