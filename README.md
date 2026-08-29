## V15 — Billing & Finance clarity
- Tambah ringkasan pemasukan, pengeluaran, dan saldo bersih.
- Tambah filter Semua/Pemasukan/Pengeluaran.
- Tombol Hapus transaksi dibuat jelas dan memiliki konfirmasi khusus untuk transaksi yang terhubung invoice.

# Kontrakin V7.2
Perbaikan V7.2 untuk menghilangkan efek halaman Penagihan yang berkedip/blank dan pesan "Memuat data dari Supabase..." berulang.

Perubahan:
- Loading penuh hanya ditampilkan pada pemuatan aplikasi pertama.
- Refresh data berikutnya dilakukan di background tanpa mengosongkan halaman.
- Auto-billing hanya dimulai sekali setelah data penghuni dan kamar tersedia.
- Tidak ada perubahan schema/database dan tidak perlu SQL baru.

## V8
- Penagihan WhatsApp dengan pesan otomatis yang dapat diedit sebelum dikirim.
- Invoice tertunggak memakai pesan khusus dengan nominal, jatuh tempo, dan jumlah hari keterlambatan.
- Invoice lunas memiliki pesan konfirmasi pembayaran.
- Tagihan yang sudah ditagih tetap tampil, tetapi otomatis turun di bawah tagihan yang belum ditagih.
- Tambahkan kolom `collection_status` dan `last_contacted_at` dengan `supabase/migration_v8.sql` sebelum memakai fitur ini.


## V9
Penagihan ditampilkan per kamar dengan rincian periode belum lunas, total tunggakan, pesan WhatsApp gabungan, dan konfirmasi lunas. Tidak ada migration database baru.

## V10
Perbaikan bug dan penyegaran visual. Tidak ada perubahan database.
- `index.html` dilengkapi `<!DOCTYPE>`, `<meta viewport>`, dan `<title>` yang sebelumnya hilang — penting agar tampilan mobile responsif berjalan benar di browser HP.
- Menambahkan `vite.config.js` yang benar-benar memakai `@vitejs/plugin-react` (sebelumnya sudah jadi dependency tapi tidak dipakai).
- Dashboard: angka "Pemasukan bulan ini" sekarang benar-benar dihitung dari transaksi bulan berjalan saja (sebelumnya menjumlah seluruh transaksi yang termuat).
- Urutan daftar Penagihan diperbaiki agar mengikuti prioritas: belum ditagih → tertunggak → tunggakan paling lama → jumlah bulan tertunggak terbanyak, dengan kamar yang sudah lunas semua turun ke bawah.
- Kartu Penagihan per kamar kini menampilkan indikator warna (🔴 tertunggak / 🟠 belum dibayar / 🟢 lunas) dan label "X bulan tertunggak/belum dibayar" agar cepat dipindai.
- Pesan WhatsApp penagihan & konfirmasi lunas memakai format baku (kop nama kos, rincian per periode, jumlah periode, total, status) — datanya tetap dari sumber yang sama dengan tampilan Penagihan.
- Tombol aksi (WA, Lunas) dan aksen visual disesuaikan agar lebih mudah disentuh di layar kecil.


- V15: filter Penagihan now separates uncontacted vs contacted outstanding periods; summary includes contacted amount and overdue amount; stronger neutral high-contrast theme; Dashboard shows total outstanding and overdue value.

## V16 billing rules
- Tagihan normal selalu memakai tarif kamar penuh.
- Prorata tidak digunakan untuk billing bulanan normal.
- Prorata hanya dicatat sebagai penyesuaian satu kali ketika tanggal tagihan penghuni diubah.
- `billing_day` dan `billing_adjustments` memerlukan `supabase/migration_v9.sql`.
- `manual_override` pada invoice memerlukan `supabase/migration_v10.sql`.


## V17
- Multi-properti: menu Properti, selector properti, kamar langsung terhubung ke property_id.
- Menghapus alur Tambah Rumah dari UI.
- Pembayaran manual/parsial mengurangi paid_amount dan dialokasikan ke periode tertua.
- WA menampilkan sisa tagihan, rincian periode, dan metode pembayaran properti.
- Metode pembayaran default: BCA 0571288191, DANA 08816585970, GoPay/ShopeePay 085161174317 atas nama Ryan Putra Pratama. QRIS tidak disimpan di aplikasi.
- Prorata perubahan tanggal dibulatkan ke bawah ke kelipatan Rp1.000; billing normal tetap tarif kamar penuh.
- Dashboard menghapus kalender dan memakai nilai sisa tunggakan/terlambat.
