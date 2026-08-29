-- V11: Kontrakin multi-properti + pembayaran parsial + metode pembayaran.
-- Jalankan sekali setelah migration sebelumnya.

alter table public.rooms add column if not exists property_id uuid references public.properties(id) on delete cascade;
update public.rooms r
set property_id = h.property_id
from public.houses h
where r.house_id = h.id and r.property_id is null;

alter table public.rooms alter column house_id drop not null;
create index if not exists rooms_property_id_idx on public.rooms(property_id);

alter table public.properties add column if not exists payment_bca text;
alter table public.properties add column if not exists payment_dana text;
alter table public.properties add column if not exists payment_gopay text;
alter table public.properties add column if not exists payment_name text;

update public.properties
set payment_bca = coalesce(payment_bca,'0571288191'),
    payment_dana = coalesce(payment_dana,'08816585970'),
    payment_gopay = coalesce(payment_gopay,'085161174317'),
    payment_name = coalesce(payment_name,'Ryan Putra Pratama');

alter table public.invoices add column if not exists paid_amount numeric(12,0) not null default 0 check (paid_amount >= 0);
update public.invoices set paid_amount = amount where status = 'paid' and paid_amount = 0;
create index if not exists invoices_tenant_due_idx on public.invoices(tenant_id,due_date);

notify pgrst, 'reload schema';

create unique index if not exists rooms_property_room_unique on public.rooms(property_id, room_number) where property_id is not null;
