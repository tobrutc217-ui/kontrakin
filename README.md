# Kontrakin Debug Kit

Paket ini dibuat khusus untuk membedah 2 bug yang belum selesai:

1. **Tagihan lunas masih muncul di tab "Belum Lunas"**
2. **`console.log` menunjukkan Total Invoice: 0 padahal ada data di UI**

Isi paket:

| File | Fungsi |
|---|---|
| `01_console_diagnose.js` | Paste ke browser console di halaman live app. Mengecek apakah app pakai real Supabase atau mock, dan menghitung invoice dari sumber yang benar. |
| `02_test_update_rls.js` | Paste ke console. Mencoba UPDATE satu invoice dan memverifikasi apakah RLS diam-diam memblokirnya (ini penyebab paling umum untuk bug #1). |
| `03_check_autobilling_clobber.js` | Paste ke console. Menyimpan snapshot status invoice sebelum & sesudah reload untuk membuktikan apakah auto-billing loop menimpa balik status "paid". |
| `04_rls_policy_check.sql` | Jalankan di Supabase SQL Editor. Menampilkan semua RLS policy aktif di tabel `invoices`, `tenants`, `payments`. |
| `05_invoice_status_audit.sql` | Jalankan di Supabase SQL Editor. Audit langsung ke DB: cari invoice yang `paid_amount >= amount` tapi `status != 'paid'` (inkonsistensi data asli). |

## Urutan pakai yang disarankan

1. Buka **https://kosan-permai-admin.vercel.app/** dan login seperti biasa.
2. Buka DevTools Console (F12).
3. Paste isi `01_console_diagnose.js` dulu → ini akan bilang jelas apakah kamu debugging mock atau real DB.
4. Kalau hasilnya "REAL SUPABASE AKTIF", lanjut ke Supabase Dashboard → SQL Editor → jalankan `05_invoice_status_audit.sql`.
   - Kalau query itu menemukan baris (invoice yang sudah lunas tapi status masih unpaid), berarti bug ada **di server/DB**, bukan di React. Lanjut ke `04_rls_policy_check.sql`.
5. Balik ke browser, lakukan satu pembayaran lunas percobaan, lalu paste `02_test_update_rls.js` sebelum dan sesudah pembayaran untuk lihat apakah UPDATE benar-benar mengubah baris.
6. Kalau UPDATE-nya berhasil (RLS bukan penyebab), paste `03_check_autobilling_clobber.js`, lalu reload halaman, lalu jalankan lagi — script ini akan otomatis membandingkan snapshot sebelum/sesudah reload dan bilang kalau ada invoice yang "paid" berubah balik jadi "unpaid".

Semua script ini **read-only** kecuali `02_test_update_rls.js` yang sengaja melakukan satu UPDATE test (ke invoice yang kamu pilih sendiri by ID) untuk membuktikan RLS — nilainya dikembalikan/tidak diubah drastis, aman dipakai di data asli asal kamu pilih invoice yang memang sedang kamu tes.
