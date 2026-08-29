-- OPTIONAL: setelah pg_cron diaktifkan di Supabase Dashboard > Integrations > Cron.
-- Default: arsipkan lalu hapus transaksi/tagihan yang lebih tua dari 2 tahun,
-- setiap Minggu pukul 03:30 UTC. Ubah 730 jika ingin retention berbeda.
select cron.schedule(
  'kontrakin-financial-archive',
  '30 3 * * 0',
  $$ select public.archive_old_financial_data(730); $$
);
