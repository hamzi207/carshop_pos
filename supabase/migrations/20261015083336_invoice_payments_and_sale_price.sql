-- =============================================================================
-- docs/changes.md (round 2): sale prices, invoice due dates and payments
-- =============================================================================

-- Lines: discount is per unit; sale price = unit price − discount;
-- line total = qty × sale price.
alter table public.quote_items
  add column sale_price numeric(12,2) not null default 0
    constraint quote_items_sale_price_check check (sale_price >= 0);

alter table public.quotes
  -- Invoices: when payment is due (unpaid after this date = "Due").
  add column due_date date,
  -- Σ invoice_payments.amount, kept by trigger.
  add column amount_paid numeric(12,2) not null default 0
    constraint quotes_amount_paid_check check (amount_paid >= 0);

alter table public.tenants
  add column invoice_due_days integer not null default 7
    constraint tenants_invoice_due_days_check check (invoice_due_days between 0 and 365);
grant update (invoice_due_days) on public.tenants to authenticated;

-- ---- Payments (manual logging: cash, card terminal, bank transfer, cheque) ----
create table public.invoice_payments (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  quote_id uuid not null references public.quotes(id) on delete cascade,
  amount numeric(12,2) not null constraint invoice_payments_amount_check check (amount > 0),
  payment_method text not null
    constraint invoice_payments_method_check check (payment_method in ('Cash', 'Card Terminal', 'Bank Transfer', 'Check')),
  paid_on date not null default current_date,
  notes text,
  created_by uuid references public.profiles(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now()
);
create index idx_invoice_payments_quote on public.invoice_payments (quote_id);
create index idx_invoice_payments_tenant on public.invoice_payments (tenant_id);

alter table public.invoice_payments enable row level security;
create policy "Tenant isolation for invoice payments select" on public.invoice_payments
  for select to authenticated using (tenant_id = public.current_tenant_id());
create policy "Tenant isolation for invoice payments insert" on public.invoice_payments
  for insert to authenticated with check (tenant_id = public.current_tenant_id());
create policy "Tenant isolation for invoice payments delete" on public.invoice_payments
  for delete to authenticated using (tenant_id = public.current_tenant_id());
grant select, insert, delete on public.invoice_payments to authenticated;

-- Keeps quotes.amount_paid in step with the payments. Payments only go on
-- issued (not cancelled) invoices and can't exceed the invoice total.
create or replace function public.invoice_payments_sync()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_quote_id uuid := coalesce(new.quote_id, old.quote_id);
  v_quote record;
  v_paid numeric;
begin
  select status, total_amount, tenant_id into v_quote from public.quotes where id = v_quote_id for update;
  if not found then
    return null;  -- the invoice itself is being deleted
  end if;

  if tg_op = 'INSERT' then
    if v_quote.status not in ('invoiced', 'paid') then
      raise exception 'Payments can only be recorded on issued invoices.' using errcode = '55000';
    end if;
    if new.tenant_id <> v_quote.tenant_id then
      raise exception 'Invoice not found.' using errcode = 'P0002';
    end if;
  end if;

  select coalesce(sum(amount), 0) into v_paid from public.invoice_payments where quote_id = v_quote_id;
  if v_paid > v_quote.total_amount then
    raise exception 'Payments (%) can''t be more than the invoice total (%).', v_paid, v_quote.total_amount using errcode = '23514';
  end if;

  update public.quotes set amount_paid = v_paid, updated_at = now() where id = v_quote_id;
  return null;
end;
$$;
revoke execute on function public.invoice_payments_sync() from public, anon, authenticated;

create trigger invoice_payments_sync
  after insert or delete on public.invoice_payments
  for each row execute function public.invoice_payments_sync();
