-- =========================================================================
-- 04_rls_policy_check.sql
-- -------------------------------------------------------------------------
-- CARA PAKAI:
-- Buka Supabase Dashboard -> project kamu -> SQL Editor -> New query.
-- Paste dan Run per bagian (bisa jalankan semua sekaligus juga).
--
-- TUJUAN:
-- Melihat apakah RLS aktif di tabel invoices/tenants/payments, dan apakah
-- ada policy UPDATE yang mungkin memblokir proses "tandai lunas".
-- =========================================================================

-- 1) Apakah RLS aktif di tabel-tabel penting?
select
  schemaname,
  tablename,
  rowsecurity as rls_enabled
from pg_tables
where schemaname = 'public'
  and tablename in ('invoices', 'tenants', 'payments', 'rooms', 'properties');

-- 2) Daftar semua policy yang ada, per tabel, termasuk kondisi USING/WITH CHECK
select
  schemaname,
  tablename,
  policyname,
  cmd as applies_to_command,   -- SELECT / INSERT / UPDATE / DELETE / ALL
  roles,
  qual as using_expression,        -- kondisi untuk baris yang BOLEH dibaca/ditarget
  with_check as with_check_expression -- kondisi untuk baris yang BOLEH ditulis
from pg_policies
where schemaname = 'public'
  and tablename in ('invoices', 'tenants', 'payments')
order by tablename, cmd;

-- 3) Fokus: ada tidaknya policy UPDATE khusus untuk invoices
--    Kalau hasil query ini KOSONG padahal rowsecurity = true di query #1,
--    berarti SEMUA update ke invoices akan diblokir diam-diam (tanpa error)
--    untuk siapa pun yang bukan service_role.
select *
from pg_policies
where schemaname = 'public'
  and tablename = 'invoices'
  and cmd in ('UPDATE', 'ALL');
