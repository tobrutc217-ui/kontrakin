-- V10: tandai override nominal agar billing otomatis tidak menimpa nominal khusus.
alter table public.invoices
  add column if not exists manual_override boolean not null default false;

-- Invoice lama diasumsikan mengikuti tarif kamar; nominal khusus baru akan memakai manual_override=true.
notify pgrst, 'reload schema';
