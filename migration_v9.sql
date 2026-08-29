-- V9: tanggal tagihan per penghuni + penyesuaian prorata satu kali.
-- Jalankan SEKALI di Supabase SQL Editor setelah migration_v8.sql.

alter table public.properties
  add column if not exists admin_email text;

alter table public.tenants
  add column if not exists billing_day integer;

update public.tenants
set billing_day = extract(day from lease_start)::integer
where billing_day is null;

alter table public.tenants
  alter column billing_day set default 1;

alter table public.tenants
  add constraint tenants_billing_day_check check (billing_day between 1 and 31);

create table if not exists public.billing_adjustments (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  room_id uuid not null references public.rooms(id),
  old_billing_day integer not null check (old_billing_day between 1 and 31),
  new_billing_day integer not null check (new_billing_day between 1 and 31),
  shift_days integer not null,
  amount numeric(12,0) not null check (amount <> 0),
  effective_date date not null default current_date,
  description text not null,
  created_at timestamptz not null default now()
);

alter table public.billing_adjustments enable row level security;
create policy "authenticated admins manage billing adjustments" on public.billing_adjustments
  for all to authenticated using (true) with check (true);

create index if not exists billing_adjustments_tenant_idx
  on public.billing_adjustments(tenant_id, effective_date desc);

notify pgrst, 'reload schema';
