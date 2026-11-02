// chart.js — grafik batang horizontal sederhana memakai Canvas API (tanpa library).
// Tiap baris: label kategori di kiri, nominal + persentase di kanan, batang di bawahnya.
// Tata letak ini tetap terbaca di layar 360px karena label tidak berebut ruang dengan batang.

const PALETTE = ['#3b5bdb', '#0ca678', '#f08c00', '#d6336c', '#7048e8', '#1098ad', '#e8590c', '#5c940d'];
const ROW_HEIGHT = 46;
const BAR_HEIGHT = 12;
const PADDING_Y = 8;
const FONT = '14px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';

// Ambil warna dari CSS variable supaya grafik ikut tema gelap/terang
function cssVar(name, fallback) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;
}

// Potong teks dengan "…" bila melebihi lebar maksimum
function fitText(ctx, text, maxWidth) {
  if (ctx.measureText(text).width <= maxWidth) return text;
  let result = text;
  while (result.length > 1 && ctx.measureText(`${result}…`).width > maxWidth) {
    result = result.slice(0, -1);
  }
  return `${result}…`;
}

function fillRoundedRect(ctx, x, y, width, height, radius) {
  const r = Math.min(radius, height / 2, width / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + width, y, x + width, y + height, r);
  ctx.arcTo(x + width, y + height, x, y + height, r);
  ctx.arcTo(x, y + height, x, y, r);
  ctx.arcTo(x, y, x + width, y, r);
  ctx.closePath();
  ctx.fill();
}

/**
 * @param {HTMLCanvasElement} canvas
 * @param {{label: string, value: number}[]} data  - sudah diurutkan
 * @param {{formatValue?: (n:number)=>string}} options
 */
export function drawBarChart(canvas, data, { formatValue = String } = {}) {
  const ctx = canvas.getContext('2d');
  if (!ctx || data.length === 0) return;

  // Skala ulang untuk layar retina agar teks tidak buram
  const dpr = window.devicePixelRatio || 1;
  const width = Math.max(canvas.parentElement.clientWidth, 240);
  const height = data.length * ROW_HEIGHT + PADDING_Y * 2;

  canvas.width = Math.floor(width * dpr);
  canvas.height = Math.floor(height * dpr);
  canvas.style.width = `${width}px`;
  canvas.style.height = `${height}px`;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, width, height);

  const textColor = cssVar('--text', '#1b2233');
  const mutedColor = cssVar('--text-muted', '#5a647a');
  const trackColor = cssVar('--surface-2', '#eef1f8');

  const maxValue = Math.max(...data.map((item) => item.value));
  const total = data.reduce((sum, item) => sum + item.value, 0);

  ctx.font = FONT;
  ctx.textBaseline = 'alphabetic';

  data.forEach((item, index) => {
    const top = PADDING_Y + index * ROW_HEIGHT;
    const percent = Math.round((item.value / total) * 100);
    const valueText = `${formatValue(item.value)} (${percent}%)`;

    // Teks nilai di kanan
    ctx.textAlign = 'right';
    ctx.fillStyle = mutedColor;
    ctx.fillText(valueText, width, top + 16);
    const valueWidth = ctx.measureText(valueText).width;

    // Label kategori di kiri (dipotong bila terlalu panjang)
    ctx.textAlign = 'left';
    ctx.fillStyle = textColor;
    ctx.fillText(fitText(ctx, item.label, width - valueWidth - 12), 0, top + 16);

    // Jalur latar + batang berwarna
    const barY = top + 24;
    ctx.fillStyle = trackColor;
    fillRoundedRect(ctx, 0, barY, width, BAR_HEIGHT, BAR_HEIGHT / 2);

    ctx.fillStyle = PALETTE[index % PALETTE.length];
    const barWidth = Math.max(4, (item.value / maxValue) * width);
    fillRoundedRect(ctx, 0, barY, barWidth, BAR_HEIGHT, BAR_HEIGHT / 2);
  });
}