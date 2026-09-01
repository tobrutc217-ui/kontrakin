-- =========================================================================
-- 05_invoice_status_audit.sql
-- -------------------------------------------------------------------------
-- CARA PAKAI:
-- Buka Supabase Dashboard -> project kamu -> SQL Editor -> New query.
-- Paste dan Run. Ini query READ-ONLY, aman dijalankan kapan saja.
--
-- TUJUAN:
-- Melihat kebenaran data di database secara langsung, tanpa lewat React/
-- localStorage sama sekali -- supaya kita tahu apakah bug-nya di data
-- (server/DB) atau di tampilan (frontend).
-- =========================================================================

-- 1) Total invoice di database (bandingkan dengan jumlah yang tampil di UI)
select count(*) as total_invoice from invoices;

-- 2) Invoice yang SUDAH LUNAS secara angka (paid_amount >= amount)
--    tapi status di kolom TIDAK mencerminkan itu.
--    Kalau query ini mengembalikan baris, ini BUKTI LANGSUNG bahwa
--    masalahnya ada di proses update status (server-side / trigger / RLS),
--    bukan di logic filter React.
select
  id,
  tenant_id,
  due_date,
  amount,
  paid_amount,
  status,
  paid_at,
  updated_at
from invoices
where paid_amount >= amount
  and lower(coalesce(status, '')) not in ('paid', 'lunas')
order by updated_at desc;

-- 3) Invoice yang statusnya 'paid'/'lunas' tapi paid_amount TIDAK cukup
--    (kebalikan dari #2 -- kalau ada, ini indikasi status di-set manual
--    tanpa update paid_amount, atau race condition antar dua proses tulis)
select
  id,
  tenant_id,
  due_date,
  amount,
  paid_amount,
  status,
  paid_at,
  updated_at
from invoices
where lower(coalesce(status, '')) in ('paid', 'lunas')
  and paid_amount < amount
order by updated_at desc;

-- 4) Cek duplikasi invoice untuk kombinasi tenant_id + due_date yang sama
--    (relevan untuk kecurigaan auto-billing bikin duplikat / upsert conflict
--    yang salah target)
select
  tenant_id,
  due_date,
  count(*) as jumlah_invoice_sama_periode,
  array_agg(id) as invoice_ids,
  array_agg(status) as status_masing_masing
from invoices
group by tenant_id, due_date
having count(*) > 1
order by jumlah_invoice_sama_periode desc;

-- 5) Riwayat updated_at terbaru -- kalau ada invoice yang 'updated_at'-nya
--    berubah TEPAT saat kamu reload halaman (bukan saat kamu klik "Lunas"),
--    itu indikasi kuat auto-billing loop menyentuh baris itu lagi.
select
  id,
  tenant_id,
  due_date,
  status,
  paid_amount,
  updated_at
from invoices
order by updated_at desc
limit 30;
