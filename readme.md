# Dompet Kampus – Pencatat Keuangan Mahasiswa

Aplikasi web sederhana untuk mencatat pemasukan dan pengeluaran mahasiswa. Dibuat dengan
**HTML5, CSS3, dan JavaScript ES6+ murni** (tanpa framework, library, build tool, maupun backend).
Data tersimpan di `localStorage` browser, jadi privat dan tidak dikirim ke server mana pun.

## Fitur

- CRUD transaksi (pemasukan/pengeluaran): judul, nominal, kategori, tanggal, catatan
- Filter bulan, kategori, dan tipe; pencarian; pengurutan (tanggal, nominal, judul)
- Ringkasan saldo, total pemasukan, dan total pengeluaran (mengikuti filter aktif)
- Grafik batang pengeluaran per kategori dengan Canvas API (tanpa library grafik)
- Target anggaran bulanan dengan progress bar dan peringatan (>= 80% dan melebihi target)
- Ekspor/impor JSON dan ekspor CSV
- Mode gelap/terang yang tersimpan, mengikuti preferensi sistem saat pertama kali
- Validasi form dengan pesan ramah, dialog konfirmasi hapus, toast, dan empty state
- Aksesibel: semantic HTML, label form, ARIA seperlunya, navigasi keyboard, skip link
- Aman dari XSS (data pengguna hanya lewat `textContent`) dan dari CSV injection

## Cara Menjalankan

Proyek memakai **ES Modules** (`<script type="module">`). Browser seperti Chrome dan Edge
memblokir modul bila `index.html` dibuka langsung lewat `file://`, jadi gunakan server lokal statis:

**Opsi 1 – Python (sudah terpasang di banyak komputer)**

    cd dompet-kampus
    python -m http.server 8080

Lalu buka http://localhost:8080

**Opsi 2 – VS Code**: pasang ekstensi *Live Server*, klik kanan `index.html` → *Open with Live Server*.

**Opsi 3 – Node.js**: `npx serve .`

Tidak ada `npm install` dan tidak ada proses build. Jika modul gagal dimuat, aplikasi menampilkan
banner petunjuk di bagian atas halaman.

## Struktur Proyek

    dompet-kampus/
    ├── index.html          Kerangka halaman (semantic HTML)
    ├── css/
    │   ├── base.css        Variabel warna, tema gelap/terang, reset, utilitas
    │   ├── layout.css      Grid & breakpoint (mobile-first)
    │   └── components.css  Tombol, form, kartu, daftar, toast, dialog
    ├── js/
    │   ├── app.js          Entry point, event listener (event delegation)
    │   ├── storage.js      Wrapper localStorage + penanganan error (penuh/rusak/tidak tersedia)
    │   ├── state.js        Store sederhana (observer), aksi, dan selector
    │   ├── ui.js           Seluruh manipulasi DOM, form, toast, dialog
    │   ├── utils.js        Format Rupiah/tanggal, validasi, normalisasi, CSV
    │   └── chart.js        Grafik batang dengan Canvas API
    └── README.md

## Alur Data

    aksi pengguna → app.js (validasi) → state.js (ubah state + simpan via storage.js)
                                      → subscriber → ui.renderAll(state) → DOM

## Keputusan Desain

- **State immutable + observer**: UI selalu dirender dari satu sumber kebenaran.
- **Anggaran mengikuti bulan filter** (atau bulan berjalan bila filter kosong) dan menghitung
  seluruh pengeluaran bulan itu, tidak terpengaruh filter kategori/pencarian.
- **Impor menimpa data** setelah konfirmasi; entri tidak valid dilewati dan dilaporkan.
- **Data rusak** di localStorage tidak dihapus diam-diam: salinan mentahnya disimpan di
  kunci berakhiran `.corrupt`.

## Rencana Pengembangan

- Transaksi berulang (uang saku/kos bulanan) dan kategori kustom
- Sinkronisasi antar-tab lewat event `storage`
- Mode impor "gabungkan" (merge) selain "ganti"
- Grafik tren saldo per bulan dan opsi grafik pie
- PWA (manifest + service worker) agar bisa dipakai offline
- Unit test untuk `utils.js` dan `state.js`
- Dukungan multi-bahasa dan multi-mata uang