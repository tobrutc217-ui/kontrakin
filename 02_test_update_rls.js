/**
 * 02_test_update_rls.js
 * -----------------------------------------------------------------------
 * CARA PAKAI:
 * 1. Pastikan 01_console_diagnose.js sudah dijalankan dan menemukan
 *    supabase client (window.supabase / window._supabase / window.supabaseClient).
 *    Kalau tidak ketemu, script ini tidak akan bisa jalan dari console --
 *    kamu perlu jalankan query setara ini dari SQL Editor Supabase saja.
 * 2. Ganti INVOICE_ID di bawah dengan id invoice yang mau kamu tes
 *    (ambil dari tabel invoices, boleh invoice yang statusnya masih unpaid).
 * 3. Paste seluruh file ini ke console, Enter.
 *
 * TUJUAN:
 * Membuktikan apakah UPDATE ke tabel invoices BENAR-BENAR mengubah baris,
 * atau diam-diam gagal karena RLS (Row Level Security) -- kasus di mana
 * `error` tetap null tapi jumlah baris yang berubah = 0.
 * -----------------------------------------------------------------------
 */

const INVOICE_ID = 'GANTI_DENGAN_ID_INVOICE_ASLI'; // <-- WAJIB DIGANTI

(async function testUpdateRls() {
  const client = window.supabase || window._supabase || window.supabaseClient;
  if (!client) {
    console.error('Supabase client tidak ditemukan di window. Jalankan 01_console_diagnose.js dulu.');
    return;
  }
  if (INVOICE_ID === 'GANTI_DENGAN_ID_INVOICE_ASLI') {
    console.error('Ganti dulu nilai INVOICE_ID di baris atas file ini dengan id invoice asli.');
    return;
  }

  console.log('%c=== TEST UPDATE + RLS ===', 'color:#0af;font-weight:bold');

  // Ambil kondisi sebelum
  const before = await client.from('invoices').select('*').eq('id', INVOICE_ID).single();
  console.log('SEBELUM update:', before.data, before.error);

  if (!before.data) {
    console.error('Invoice dengan id tersebut tidak ditemukan / tidak bisa dibaca (cek juga RLS SELECT).');
    return;
  }

  // Update field yang aman untuk di-toggle balik: kita ubah 'notes' kecil
  // sekaligus paid_amount dengan nilai YANG SAMA (tidak merusak data asli),
  // supaya bisa lihat apakah write-nya kena atau tidak.
  const testMarker = `debug-test-${Date.now()}`;
  const { data: updateResult, error: updateError } = await client
    .from('invoices')
    .update({
      paid_amount: before.data.paid_amount, // nilai sama, tidak mengubah data asli
      status: before.data.status,           // nilai sama
      debug_marker: testMarker,             // kalau kolom ini tidak ada, Supabase akan error -- itu OK, abaikan errornya, fokus ke bagian bawah
    })
    .eq('id', INVOICE_ID)
    .select();

  console.log('Response UPDATE (dengan kolom test debug_marker, boleh error kalau kolom tidak ada):', updateResult, updateError);

  // Test paling penting: update field asli TANPA kolom fiktif
  const { data: realUpdateResult, error: realUpdateError } = await client
    .from('invoices')
    .update({
      paid_amount: before.data.paid_amount,
      status: before.data.status,
    })
    .eq('id', INVOICE_ID)
    .select(); // <-- kunci: .select() memaksa Supabase mengembalikan baris yang benar-benar ter-update

  console.log('%c--- HASIL TEST UTAMA ---', 'color:#fa0;font-weight:bold');
  console.log('error:', realUpdateError);
  console.log('rows returned (jumlah baris yang BENAR-BENAR ter-update):', realUpdateResult?.length);

  if (realUpdateError) {
    console.log('%c-> ADA ERROR EKSPLISIT dari Supabase. Baca pesan error di atas -- ini biasanya bukan RLS silent, tapi error kolom/tipe data.', 'color:#f00');
  } else if (!realUpdateResult || realUpdateResult.length === 0) {
    console.log('%c-> BUG DITEMUKAN: error = null TAPI 0 baris ter-update.', 'color:#f00;font-weight:bold');
    console.log('   Ini ciri khas RLS UPDATE policy yang memblokir tanpa memberi error.');
    console.log('   Cek Supabase Dashboard -> Authentication -> Policies -> tabel invoices -> pastikan ada policy UPDATE');
    console.log('   yang kondisinya cocok dengan user yang sedang login (cek auth.uid() vs kolom owner di invoice/tenant/property).');
  } else {
    console.log('%c-> UPDATE BERHASIL (1 baris ter-update). RLS BUKAN penyebab bug ini.', 'color:#0f0;font-weight:bold');
    console.log('   Lanjutkan investigasi ke 03_check_autobilling_clobber.js -- kemungkinan auto-billing loop yang menimpa balik status.');
  }

  console.log('%c=== TEST SELESAI (tidak ada data asli yang berubah nilainya) ===', 'color:#0af;font-weight:bold');
})();
