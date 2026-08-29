-- Run once on the existing Supabase project. Safe for existing rows.
alter table tenants add column if not exists email text;


create table if not exists data_archive (
  id uuid primary key default gen_random_uuid(),
  source_table text not null,
  source_id uuid not null,
  archived_at timestamptz not null default now(),
  payload jsonb not null
);

alter table data_archive enable row level security;

drop policy if exists "authenticated admins manage data archive" on data_archive;
create policy "authenticated admins manage data archive" on data_archive
  for all to authenticated using (true) with check (true);

create or replace function archive_old_financial_data(retention_days integer default 730)
returns integer language plpgsql security invoker as $$
declare archived_count integer := 0;
begin
  insert into data_archive(source_table, source_id, payload)
  select 'transactions', t.id, to_jsonb(t) from transactions t
  where t.transaction_date < current_date - make_interval(days => retention_days)
    and not exists (select 1 from data_archive a where a.source_table='transactions' and a.source_id=t.id);
  get diagnostics archived_count = row_count;
  insert into data_archive(source_table, source_id, payload)
  select 'invoices', i.id, to_jsonb(i) from invoices i
  where i.due_date < current_date - make_interval(days => retention_days)
    and not exists (select 1 from data_archive a where a.source_table='invoices' and a.source_id=i.id);
  delete from transactions where transaction_date < current_date - make_interval(days => retention_days);
  delete from invoices where due_date < current_date - make_interval(days => retention_days);
  return archived_count;
end; $$;
