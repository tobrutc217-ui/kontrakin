/**
 * 01_console_diagnose.js
 * -----------------------------------------------------------------------
 * CARA PAKAI:
 * 1. Buka https://kosan-permai-admin.vercel.app/ dan login.
 * 2. Buka DevTools (F12) -> tab Console.
 * 3. Copy-paste seluruh isi file ini, lalu Enter.
 *
 * TUJUAN:
 * Menjawab pertanyaan paling mendasar sebelum debug lebih jauh:
 * "Apakah app ini sedang pakai REAL Supabase atau MOCK localStorage?"
 * Kalau kamu debug di tempat yang salah, semua kesimpulan berikutnya salah.
 * -----------------------------------------------------------------------
 */

(function diagnose() {
  console.log('%c=== KONTRAKIN DIAGNOSE START ===', 'color:#0af;font-weight:bold');

  // 1) Cek env var Supabase yang ter-bundle ke build production
  let envUrl = null;
  try {
    // Vite inline env di build time; kalau app di-build dengan Supabase config,
    // biasanya masih bisa dideteksi lewat objek global yang di-expose,
    // atau lewat ada/tidaknya request ke *.supabase.co di Network tab.
    envUrl = window.__SUPABASE_URL__ || null;
  } catch (e) {}

  // 2) Cek localStorage mock keys
  const mockKeys = Object.keys(localStorage).filter(k => k.startsWith('kos_'));
  console.log('Mock-style localStorage keys ditemukan:', mockKeys);

  let mockInvoiceCount = null;
  try {
    const raw = localStorage.getItem('kos_db_invoices');
    mockInvoiceCount = raw ? JSON.parse(raw).length : 0;
  } catch (e) {
    mockInvoiceCount = 'ERROR PARSE: ' + e.message;
  }
  console.log('Jumlah invoice via localStorage (kos_db_invoices):', mockInvoiceCount);

  // 3) Cek apakah ada traffic ke *.supabase.co (indikasi real client aktif)
  const perfEntries = performance.getEntriesByType('resource')
    .filter(r => r.name.includes('supabase.co'));
  console.log('Jumlah request ke *.supabase.co yang tercatat performance API:', perfEntries.length);
  if (perfEntries.length > 0) {
    console.log('Contoh URL:', perfEntries.slice(0, 3).map(r => r.name));
  }

  // 4) Coba temukan instance supabase client kalau di-expose ke window
  //    (banyak app taruh window.supabase = supabase; saat development)
  const candidateNames = ['supabase', '_supabase', 'supabaseClient'];
  let client = null;
  for (const name of candidateNames) {
    if (window[name] && typeof window[name].from === 'function') {
      client = window[name];
      console.log(`Ditemukan supabase client di window.${name}`);
      break;
    }
  }

  console.log('%c--- KESIMPULAN SEMENTARA ---', 'color:#fa0;font-weight:bold');
  if (perfEntries.length > 0) {
    console.log('%c-> REAL SUPABASE AKTIF (ada network request ke supabase.co).', 'color:#0f0');
    console.log('   localStorage kos_db_invoices TIDAK RELEVAN sebagai sumber data.');
    console.log('   Jangan percaya console.log yang baca dari localStorage untuk invoice count.');
  } else if (mockInvoiceCount && mockInvoiceCount !== 0 && mockInvoiceCount !== 'ERROR PARSE') {
    console.log('%c-> MOCK localStorage AKTIF (tidak ada traffic ke supabase.co, tapi ada data mock).', 'color:#0f0');
    console.log('   VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY kemungkinan kosong di environment ini.');
  } else {
    console.log('%c-> TIDAK JELAS. Tidak ada traffic supabase.co TERCATAT dan mock juga kosong.', 'color:#f00');
    console.log('   Kemungkinan: performance entries sudah ke-clear (reload lama), atau app baru saja dibuka.');
    console.log('   Coba reload halaman (Ctrl+R) LALU langsung jalankan script ini lagi tanpa navigasi apa pun.');
  }

  if (client) {
    console.log('%c--- MENCOBA QUERY LANGSUNG KE SUPABASE ---', 'color:#fa0;font-weight:bold');
    client.from('invoices').select('id, tenant_id, amount, paid_amount, status, due_date')
      .then(({ data, error }) => {
        if (error) {
          console.error('Query invoices error:', error);
        } else {
          console.log('Total invoice di DB (real query):', data.length);
          console.table(data);
          const inconsistent = data.filter(i =>
            Number(i.paid_amount || 0) >= Number(i.amount || 0) &&
            String(i.status).toLowerCase() !== 'paid' &&
            String(i.status).toLowerCase() !== 'lunas'
          );
          console.log('%cInvoice yang SUDAH LUNAS (paid_amount>=amount) tapi status BUKAN paid/lunas:', 'color:#f00;font-weight:bold');
          console.table(inconsistent);
        }
      });
  } else {
    console.log('%cTidak menemukan instance supabase client di window. ', 'color:#f80');
    console.log('Ini NORMAL kalau app tidak sengaja expose client-nya ke global scope.');
    console.log('Lanjutkan diagnosis lewat Supabase SQL Editor (lihat 05_invoice_status_audit.sql).');
  }

  console.log('%c=== KONTRAKIN DIAGNOSE END ===', 'color:#0af;font-weight:bold');
})();
