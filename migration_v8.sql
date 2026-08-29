-- V8: penagihan WhatsApp, status sudah ditagih, dan template pesan.
-- Aman dijalankan sekali; tidak menghapus data invoice yang sudah ada.

alter table public.invoices
  add column if not exists collection_status text not null default 'not_contacted'
    check (collection_status in ('not_contacted','contacted'));

alter table public.invoices
  add column if not exists last_contacted_at timestamptz;

create index if not exists invoices_collection_status_idx
  on public.invoices(collection_status);

notify pgrst, 'reload schema';
