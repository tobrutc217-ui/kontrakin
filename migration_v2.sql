-- Jalankan sekali setelah schema.sql yang lama.
-- Menambah catatan maintenance tanpa menghapus data lama.
alter table rooms add column if not exists maintenance_notes text;
