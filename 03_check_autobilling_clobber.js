/**
 * 03_check_autobilling_clobber.js
 * -----------------------------------------------------------------------
 * CARA PAKAI:
 * LANGKAH 1 (SEBELUM reload):
 *   - Paste file ini ke console, Enter.
 *   - Script akan simpan snapshot semua invoice (id, status, paid_amount)
 *     ke sessionStorage.
 * LANGKAH 2:
 *   - Reload halaman (F5). Tunggu sampai app selesai load & auto-billing
 *     (kalau ada) selesai jalan (tunggu beberapa detik).
 * LANGKAH 3 (SESUDAH reload):
 *   - Paste file ini LAGI ke console, Enter.
 *   - Kali ini script akan bandingkan snapshot lama vs data terbaru,
 *     dan tunjukkan invoice mana saja yang statusnya BERUBAH BALIK
 *     (misal dari 'paid' jadi 'unpaid') tanpa ada aksi pembayaran manual.
 *
 * TUJUAN:
 * Membuktikan (atau menyingkirkan) dugaan bahwa auto-billing loop di
 * main.jsx menimpa ulang invoice yang sudah lunas setiap kali app di-reload.
 * -----------------------------------------------------------------------
 */

(async function checkClobber() {
  const client = window.supabase || window._supabase || window.supabaseClient;
  if (!client) {
    console.error('Supabase client tidak ditemukan di window. Jalankan 01_console_diagnose.js dulu untuk cek.');
    return;
  }

  const SNAPSHOT_KEY = 'kontrakin_debug_snapshot';

  const { data, error } = await client
    .from('invoices')
    .select('id, tenant_id, due_date, amount, paid_amount, status, paid_at, updated_at');

  if (error) {
    console.error('Gagal ambil data invoices:', error);
    return;
  }

  const prevRaw = sessionStorage.getItem(SNAPSHOT_KEY);

  if (!prevRaw) {
    // Ini run pertama -> simpan snapshot
    sessionStorage.setItem(SNAPSHOT_KEY, JSON.stringify(data));
    console.log('%c=== SNAPSHOT DISIMPAN ===', 'color:#0af;font-weight:bold');
    console.log(`Tersimpan ${data.length} invoice. Sekarang RELOAD halaman (F5), `);
    console.log('tunggu beberapa detik sampai auto-billing (kalau ada) selesai jalan,');
    console.log('lalu paste & jalankan script ini LAGI untuk lihat perbandingannya.');
    console.table(data);
    return;
  }

  // Ini run kedua -> bandingkan
  const prev = JSON.parse(prevRaw);
  const prevMap = new Map(prev.map(i => [i.id, i]));

  const changed = [];
  for (const curr of data) {
    const before = prevMap.get(curr.id);
    if (!before) continue; // invoice baru, bukan bagian dari investigasi ini
    if (
      before.status !== curr.status ||
      Number(before.paid_amount || 0) !== Number(curr.paid_amount || 0)
    ) {
      changed.push({
        id: curr.id,
        tenant_id: curr.tenant_id,
        due_date: curr.due_date,
        status_before: before.status,
        status_after: curr.status,
        paid_amount_before: before.paid_amount,
        paid_amount_after: curr.paid_amount,
      });
    }
  }

  console.log('%c=== HASIL PERBANDINGAN SEBELUM vs SESUDAH RELOAD ===', 'color:#0af;font-weight:bold');
  if (changed.length === 0) {
    console.log('%cTidak ada invoice yang berubah status/paid_amount setelah reload.', 'color:#0f0');
    console.log('Auto-billing loop KEMUNGKINAN BESAR bukan penyebab bug ini.');
    console.log('Balik cek 02_test_update_rls.js kalau belum, atau cek isPaidOff()/filter di React sebagai kemungkinan terakhir.');
  } else {
    const clobberedToPaidBecameUnpaid = changed.filter(c =>
      ['paid', 'lunas'].includes(String(c.status_before).toLowerCase()) &&
      !['paid', 'lunas'].includes(String(c.status_after).toLowerCase())
    );
    console.log(`%c${changed.length} invoice berubah setelah reload:`, 'color:#fa0;font-weight:bold');
    console.table(changed);

    if (clobberedToPaidBecameUnpaid.length > 0) {
      console.log('%cBUG TERBUKTI: invoice yang sebelumnya PAID berubah balik jadi TIDAK paid setelah reload!', 'color:#f00;font-weight:bold');
      console.log('Ini konsisten dengan auto-billing loop di main.jsx yang meng-upsert ulang invoice');
      console.log('untuk tenant_id + due_date yang sama tanpa mengecualikan invoice yang sudah lunas.');
      console.log('Invoice yang terdampak:', clobberedToPaidBecameUnpaid);
    } else {
      console.log('Ada perubahan, tapi bukan pola "paid jadi unpaid" -- kemungkinan perubahan normal (misal ada pembayaran baru).');
    }
  }

  // Bersihkan snapshot supaya run berikutnya mulai dari awal lagi
  sessionStorage.removeItem(SNAPSHOT_KEY);
})();
