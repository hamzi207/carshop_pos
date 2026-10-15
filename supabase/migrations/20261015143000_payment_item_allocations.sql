-- docs/changes.md (round 5): a payment can be applied to specific invoice lines.
-- Each allocation says how much of a payment (and optionally how many units)
-- went to one line. Any part of a payment not applied to lines is a general
-- payment on the invoice. A line's share of the invoice is its net total's
-- share of the invoice total, so tax and the invoice discount are included.
create table public.invoice_payment_items (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  payment_id uuid not null references public.invoice_payments(id) on delete cascade,
  quote_id uuid not null references public.quotes(id) on delete cascade,
  -- Editing an invoice replaces its lines: the link is cleared, then restored
  -- by quote_items_relink_payments when a line with the same part/description returns.
  quote_item_id uuid references public.quote_items(id) on delete set null,
  item_id uuid references public.inventory_items(id) on delete set null,
  description text not null,
  quantity numeric(10,2) constraint invoice_payment_items_quantity_check check (quantity is null or quantity > 0),
  amount numeric(12,2) not null constraint invoice_payment_items_amount_check check (amount > 0),
  created_at timestamptz not null default now()
);

create index idx_invoice_payment_items_payment on public.invoice_payment_items (payment_id);
create index idx_invoice_payment_items_quote on public.invoice_payment_items (quote_id);
create index idx_invoice_payment_items_line on public.invoice_payment_items (quote_item_id);
create index idx_invoice_payment_items_tenant on public.invoice_payment_items (tenant_id);
create index idx_invoice_payment_items_item on public.invoice_payment_items (item_id);

alter table public.invoice_payment_items enable row level security;
create policy "Tenant isolation for payment allocations select" on public.invoice_payment_items
  for select to authenticated using (tenant_id = public.current_tenant_id());
create policy "Tenant isolation for payment allocations insert" on public.invoice_payment_items
  for insert to authenticated with check (tenant_id = public.current_tenant_id());
grant select, insert on public.invoice_payment_items to authenticated;

-- Re-link allocations after an invoice's lines are saved again.
create or replace function public.quote_items_relink_payments()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- If an invoice has two identical lines, the first one saved takes the allocations.
  update public.invoice_payment_items a
  set quote_item_id = new.id
  where a.quote_id = new.quote_id
    and a.quote_item_id is null
    and a.item_id is not distinct from new.item_id
    and a.description = new.description;
  return new;
end;
$$;
revoke execute on function public.quote_items_relink_payments() from public, anon, authenticated;

create trigger quote_items_relink_payments
  after insert on public.quote_items
  for each row execute function public.quote_items_relink_payments();

-- Records a payment and its line allocations in one step.
-- p_items: [{ "quoteItemId": uuid, "amount": number, "quantity": number|null }]
create or replace function public.record_payment(
  p_quote_id uuid,
  p_amount numeric,
  p_method text,
  p_paid_on date,
  p_notes text default null,
  p_items jsonb default '[]'::jsonb
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_quote public.quotes;
  v_payment_id uuid;
  v_lines_total numeric;
  v_applied numeric := 0;
  r record;
begin
  select * into v_quote from public.quotes where id = p_quote_id;
  if not found then
    raise exception 'Invoice not found.' using errcode = 'P0002';
  end if;

  insert into public.invoice_payments (tenant_id, quote_id, amount, payment_method, paid_on, notes)
  values (v_quote.tenant_id, p_quote_id, round(p_amount, 2), p_method, p_paid_on, nullif(btrim(p_notes), ''))
  returning id into v_payment_id;

  select coalesce(sum(total_price), 0) into v_lines_total from public.quote_items where quote_id = p_quote_id;

  for r in
    select (e->>'quoteItemId')::uuid as line_id,
           round((e->>'amount')::numeric, 2) as amount,
           nullif(e->>'quantity', '')::numeric as quantity
    from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) as e
  loop
    if r.amount is null or r.amount <= 0 then
      continue;
    end if;
    declare
      v_line public.quote_items;
      v_share numeric;
      v_paid numeric;
    begin
      select * into v_line from public.quote_items where id = r.line_id and quote_id = p_quote_id;
      if not found then
        raise exception 'That item is not on this invoice.' using errcode = '23514';
      end if;
      if r.quantity is not null and r.quantity > v_line.quantity then
        raise exception '"%" has only % on the invoice.', v_line.description, v_line.quantity using errcode = '23514';
      end if;
      v_share := case when v_lines_total > 0 then round(v_line.total_price / v_lines_total * v_quote.total_amount, 2) else 0 end;
      select coalesce(sum(amount), 0) into v_paid from public.invoice_payment_items where quote_item_id = v_line.id;
      if v_paid + r.amount > v_share + 0.01 then
        raise exception '"%" has only % left to pay.', v_line.description, greatest(v_share - v_paid, 0) using errcode = '23514';
      end if;
      insert into public.invoice_payment_items (tenant_id, payment_id, quote_id, quote_item_id, item_id, description, quantity, amount)
      values (v_quote.tenant_id, v_payment_id, p_quote_id, v_line.id, v_line.item_id, v_line.description, r.quantity, r.amount);
      v_applied := v_applied + r.amount;
    end;
  end loop;

  if v_applied > round(p_amount, 2) + 0.005 then
    raise exception 'The amounts applied to items (%) are more than the payment (%).', v_applied, round(p_amount, 2) using errcode = '23514';
  end if;

  return v_payment_id;
end;
$$;

revoke all on function public.record_payment(uuid, numeric, text, date, text, jsonb) from public, anon;
grant execute on function public.record_payment(uuid, numeric, text, date, text, jsonb) to authenticated;
