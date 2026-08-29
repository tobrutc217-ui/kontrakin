-- V5: admin email + automated reminder log
alter table properties add column if not exists admin_email text;

create table if not exists invoice_reminder_log (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references invoices(id) on delete cascade,
  reminder_key text not null,
  sent_at timestamptz not null default now(),
  unique(invoice_id, reminder_key)
);

alter table invoice_reminder_log enable row level security;
drop policy if exists "authenticated admins manage reminder log" on invoice_reminder_log;
create policy "authenticated admins manage reminder log" on invoice_reminder_log
  for all to authenticated using (true) with check (true);
