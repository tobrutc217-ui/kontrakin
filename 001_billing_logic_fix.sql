-- KONTRAKIN billing logic migration
-- Jalankan di Supabase SQL Editor.
-- Tujuan utama: hilangkan ketergantungan pada invoices.manual_override dan siapkan
-- field yang dibutuhkan untuk billing day, pembayaran parsial, prorata sekali pakai.

-- 1) TENANTS: satu tanggal tagihan yang berasal dari tanggal masuk.
alter table tenants add column if not exists billing_day integer;
update tenants set billing_day = extract(day from start_date)::integer where billing_day is null;
alter table tenants alter column billing_day set not null;
alter table tenants drop constraint if exists tenants_billing_day_check;
alter table tenants add constraint tenants_billing_day_check check (billing_day between 1 and 31);

-- 2) INVOICES: dukung skema lama yang memakai due_date maupun skema billing period.
alter table invoices add column if not exists period_start date;
alter table invoices add column if not exists period_end date;
alter table invoices add column if not exists late_fee numeric(12,0) not null default 0;
update invoices set period_start = due_date where period_start is null and due_date is not null;
update invoices set period_end = period_start where period_end is null and period_start is not null;

-- Jangan pakai status 'partial' karena sebagian schema lama hanya mengizinkan
-- unpaid/paid/overdue. Pembayaran parsial tetap berstatus unpaid/overdue dan
-- sisa dihitung dari payment allocations.

-- 3) PAYMENTS: catatan pembayaran + allocation FIFO.
create table if not exists payments (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  amount numeric(12,0) not null check (amount > 0),
  paid_at timestamptz not null default now(),
  method text,
  allocation jsonb not null default '[]'::jsonb,
  note text
);
create index if not exists idx_payments_tenant_paidat on payments(tenant_id, paid_at);

-- 4) PRORATA: adjustment satu kali saat billing day berubah.
create table if not exists prorata_adjustments (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  old_billing_day integer not null check (old_billing_day between 1 and 31),
  new_billing_day integer not null check (new_billing_day between 1 and 31),
  days_shifted integer not null,
  amount numeric(12,0) not null,
  adjustment_date date not null default current_date,
  status text not null default 'unpaid' check (status in ('unpaid','paid','cancelled')),
  created_at timestamptz not null default now()
);
create index if not exists idx_prorata_adjustments_tenant on prorata_adjustments(tenant_id, adjustment_date);

-- 5) TRANSACTIONS: lengkapi kolom agar pembayaran bisa masuk ke Keuangan.
alter table transactions add column if not exists type text;
alter table transactions add column if not exists amount numeric(12,0);
alter table transactions add column if not exists source text;
alter table transactions add column if not exists category text;
alter table transactions add column if not exists description text;
alter table transactions add column if not exists transaction_date date default current_date;
alter table transactions add column if not exists invoice_id uuid;

-- 6) RLS untuk tabel baru.
alter table payments enable row level security;
alter table prorata_adjustments enable row level security;

create policy if not exists "authenticated admins manage payments" on payments
for all to authenticated using (true) with check (true);
create policy if not exists "authenticated admins manage prorata" on prorata_adjustments
for all to authenticated using (true) with check (true);
