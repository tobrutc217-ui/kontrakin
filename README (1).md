# Kontrakin — Billing Logic Fixed

Ini patch LOGIKA, bukan redesign UI.

## Aturan yang dipakai
1. Tanggal masuk dimasukkan satu kali.
2. Tanggal masuk menjadi tanggal tagihan awal (`billing_day`).
3. Tagihan bulanan normal selalu tarif kamar FULL.
4. Sistem membuat/membaca periode yang sudah jatuh tempo; tidak memakai prorata untuk tagihan normal.
5. Tunggakan ditampilkan per penghuni dengan jumlah periode yang belum lunas.
6. Pembayaran sebagian dialokasikan FIFO: periode paling lama dibayar dulu.
7. Contoh: tunggakan 2 bulan Rp500.000 + Rp500.000, bayar Rp500.000 -> periode pertama lunas, periode kedua masih Rp500.000.
8. `Total tunggakan` hanya menjumlahkan sisa yang benar-benar belum dibayar.
9. `Nilai terlambat` hanya menjumlahkan sisa invoice yang tanggal jatuh temponya sudah lewat.
10. Pindah tanggal, misalnya 10 -> 25, hanya membuat satu penyesuaian prorata untuk selisih 15 hari. Periode berikutnya kembali tarif penuh.
11. Pembulatan prorata mengikuti contoh yang disepakati: Rp26.667 -> Rp25.000 (turun ke kelipatan Rp5.000).
12. Tidak ada referensi `manual_override` pada logic baru.

## File
- `api/fix-billing.js` — hitung tunggakan dan keterlambatan dengan benar.
- `api/allocate-payment.js` — pembayaran sebagian FIFO dan tidak menghitung ulang invoice seolah belum dibayar.
- `api/change-billing-day.js` — pindah tanggal + prorata sekali.
- `lib/prorata.js` — rumus prorata + pembulatan.
- `supabase/001_billing_logic_fix.sql` — tambah billing_day dan tabel penyesuaian.

## Urutan penerapan
1. Jalankan `supabase/001_billing_logic_fix.sql` di Supabase SQL Editor.
2. Copy tiga file API dan satu file lib ke project Vercel/Next.js dengan path yang sama.
3. Pastikan UI TIDAK lagi memanggil `.select('manual_override')`, `.eq('manual_override', ...)`, atau `.update({manual_override: ...})`.
4. UI pembayaran harus POST ke `/api/allocate-payment` dengan `{ tenant_id, amount, method }`.
5. UI pindah tanggal harus POST ke `/api/change-billing-day` dengan `{ tenant_id, new_billing_day }`.
6. Setelah deploy, test skenario di bawah.

## Test wajib
- Nanda: 2 invoice x Rp400.000. Bayar Rp400.000 -> sisa Rp400.000, bukan Rp800.000.
- Nanda: 2 invoice x Rp400.000. Bayar Rp200.000 -> sisa Rp600.000.
- Putri: 1 invoice Rp500.000. Bayar Rp100.000 -> sisa Rp400.000.
- Jika besok jatuh tempo invoice baru, invoice bulan baru = tarif penuh; jangan dihitung prorata.
- Pindah tanggal 10 -> 25: hanya ada satu adjustment; bulan berikutnya tetap tarif penuh.
