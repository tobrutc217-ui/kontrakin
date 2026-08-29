-- Jalankan sekali di SQL Editor Supabase.
create table if not exists properties (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  address text,
  admin_email text,
  payment_bca text default '0571288191',
  payment_dana text default '08816585970',
  payment_gopay text default '085161174317',
  payment_name text default 'Ryan Putra Pratama',
  created_at timestamptz not null default now()
);

create table if not exists houses (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references properties(id) on delete cascade,
  name text not null,
  address text,
  unique(property_id, name)
);

create table if not exists rooms (
  id uuid primary key default gen_random_uuid(),
  house_id uuid references houses(id) on delete cascade,
  property_id uuid references properties(id) on delete cascade,
  room_number text not null,
  monthly_rate numeric(12,0) not null check (monthly_rate >= 0),
  status text not null default 'vacant' check (status in ('vacant','occupied','maintenance')),
  facilities text[] not null default '{}',
  maintenance_notes text,
  unique(house_id, room_number)
);

create table if not exists tenants (
  id uuid primary key default gen_random_uuid(),
  room_id uuid unique references rooms(id) on delete set null,
  full_name text not null,
  email text,
  whatsapp_number text not null,
  id_card_number text,
  lease_start date not null,
  lease_end date,
  billing_day integer not null default 1 check (billing_day between 1 and 31),
  created_at timestamptz not null default now()
);

create table if not exists invoices (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  room_id uuid not null references rooms(id),
  due_date date not null,
  amount numeric(12,0) not null check (amount >= 0),
  manual_override boolean not null default false,
  status text not null default 'unpaid' check (status in ('unpaid','paid','overdue')),
  paid_at timestamptz,
  paid_amount numeric(12,0) not null default 0 check (paid_amount >= 0),
  collection_status text not null default 'not_contacted' check (collection_status in ('not_contacted','contacted')),
  last_contacted_at timestamptz,
  created_at timestamptz not null default now(),
  unique(tenant_id, due_date)
);

create table if not exists transactions (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references properties(id) on delete cascade,
  invoice_id uuid references invoices(id) on delete set null,
  category text not null,
  description text not null,
  amount numeric(12,0) not null check (amount <> 0),
  transaction_date date not null default current_date,
  created_at timestamptz not null default now()
);

-- Aktifkan Row Level Security, lalu sesuaikan kebijakan ini saat organisasi/admin bertambah.
alter table properties enable row level security;
alter table houses enable row level security;
alter table rooms enable row level security;
alter table tenants enable row level security;
alter table invoices enable row level security;

create table if not exists billing_adjustments (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  room_id uuid not null references rooms(id),
  old_billing_day integer not null check (old_billing_day between 1 and 31),
  new_billing_day integer not null check (new_billing_day between 1 and 31),
  shift_days integer not null,
  amount numeric(12,0) not null check (amount <> 0),
  effective_date date not null default current_date,
  description text not null,
  created_at timestamptz not null default now()
);

alter table billing_adjustments enable row level security;
create policy "authenticated admins manage billing adjustments" on billing_adjustments for all to authenticated using (true) with check (true);

alter table transactions enable row level security;

create policy "authenticated admins manage properties" on properties for all to authenticated using (true) with check (true);
create policy "authenticated admins manage houses" on houses for all to authenticated using (true) with check (true);
create policy "authenticated admins manage rooms" on rooms for all to authenticated using (true) with check (true);
create policy "authenticated admins manage tenants" on tenants for all to authenticated using (true) with check (true);
create policy "authenticated admins manage invoices" on invoices for all to authenticated using (true) with check (true);
create policy "authenticated admins manage transactions" on transactions for all to authenticated using (true) with check (true);


-- Prevent one invoice from being posted to finance more than once.

-- Archive old financial records before periodic cleanup.
create table if not exists data_archive (
  id uuid primary key default gen_random_uuid(),
  source_table text not null,
  source_id uuid not null,
  archived_at timestamptz not null default now(),
  payload jsonb not null
);

alter table data_archive enable row level security;
create policy "authenticated admins manage data archive" on data_archive
  for all to authenticated using (true) with check (true);

create or replace function archive_old_financial_data(retention_days integer default 730)
returns integer
language plpgsql
security invoker
as $$
declare archived_count integer := 0;
begin
  insert into data_archive(source_table, source_id, payload)
  select 'transactions', t.id, to_jsonb(t)
  from transactions t
  where t.transaction_date < current_date - make_interval(days => retention_days)
    and not exists (
      select 1 from data_archive a where a.source_table='transactions' and a.source_id=t.id
    );
  get diagnostics archived_count = row_count;

  insert into data_archive(source_table, source_id, payload)
  select 'invoices', i.id, to_jsonb(i)
  from invoices i
  where i.due_date < current_date - make_interval(days => retention_days)
    and not exists (
      select 1 from data_archive a where a.source_table='invoices' and a.source_id=i.id
    );

  delete from transactions
  where transaction_date < current_date - make_interval(days => retention_days);

  delete from invoices
  where due_date < current_date - make_interval(days => retention_days);

  return archived_count;
end;
$$;
