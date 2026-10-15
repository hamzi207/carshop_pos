-- =============================================================================
-- docs/changes.md: document lifecycle, stock reservations, pricing, metrics
-- =============================================================================

-- ---- Numbers ------------------------------------------------------------------
-- A draft may keep the Q- number of the quotation it was downgraded from; it
-- gets that number back when re-issued.
alter table public.quotes add constraint quotes_stage_numbers_check check (
  (status = 'draft' and draft_number is not null and invoice_number is null)
  or (status in ('sent', 'accepted', 'cancelled') and quotation_number is not null and invoice_number is null)
  or (status in ('invoiced', 'paid') and invoice_number is not null)
);

alter table public.quotes
  add column quote_number text not null generated always as (
    case
      when status = 'draft' then draft_number
      when invoice_number is not null then invoice_number
      else quotation_number
    end
  ) stored;

-- ---- Stock state machine (§5) -------------------------------------------------
--   draft / cancelled      → nothing held
--   sent / accepted        → reserved_quantity += qty   (quotation)
--   invoiced / paid        → quantity_on_hand  -= qty   (invoice)
-- Each part line records what it currently holds (reserved_qty / deducted_qty).
-- Any change to a line first gives back what it held, then takes what its
-- document's stage needs, so every path (save, convert, cancel, delete, edit)
-- stays consistent. Nothing can take more than is available
-- (on hand − reserved by other quotations).
create or replace function public.quote_items_sync_stock()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_status text;
  v_reserve integer := 0;
  v_deduct integer := 0;
  v_item record;
  v_available integer;
begin
  if tg_op in ('UPDATE', 'DELETE') and old.item_id is not null and (old.reserved_qty > 0 or old.deducted_qty > 0) then
    update public.inventory_items
    set reserved_quantity = reserved_quantity - old.reserved_qty,
        quantity_on_hand = quantity_on_hand + old.deducted_qty
    where id = old.item_id;
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;

  new.reserved_qty := 0;
  new.deducted_qty := 0;
  if new.item_id is null or new.is_labor then
    return new;
  end if;

  select status into v_status from public.quotes where id = new.quote_id;
  if v_status in ('sent', 'accepted') then
    v_reserve := new.quantity::integer;
  elsif v_status in ('invoiced', 'paid') then
    v_deduct := new.quantity::integer;
  else
    return new;
  end if;

  select name, quantity_on_hand, reserved_quantity into v_item
  from public.inventory_items where id = new.item_id for update;
  if not found then
    return new;
  end if;

  v_available := v_item.quantity_on_hand - v_item.reserved_quantity;
  if v_reserve + v_deduct > v_available then
    raise exception 'Not enough stock for %: % available (% on hand, % reserved on quotations).',
      v_item.name, greatest(v_available, 0), v_item.quantity_on_hand, v_item.reserved_quantity
      using errcode = '23514';
  end if;

  update public.inventory_items
  set reserved_quantity = reserved_quantity + v_reserve,
      quantity_on_hand = quantity_on_hand - v_deduct
  where id = new.item_id;

  new.reserved_qty := v_reserve;
  new.deducted_qty := v_deduct;
  return new;
end;
$$;
revoke execute on function public.quote_items_sync_stock() from public, anon, authenticated;

create trigger quote_items_sync_stock
  before insert or update or delete on public.quote_items
  for each row execute function public.quote_items_sync_stock();

-- A stage change re-runs the line trigger for every line of the document.
create or replace function public.quotes_sync_stage_stock()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.quote_items set quantity = quantity where quote_id = new.id;
  return null;
end;
$$;
revoke execute on function public.quotes_sync_stage_stock() from public, anon, authenticated;

create trigger quotes_sync_stage_stock
  after update of status on public.quotes
  for each row when (old.status is distinct from new.status)
  execute function public.quotes_sync_stage_stock();

-- inventory_deducted now means "this document's stock is deducted" (invoiced).
create or replace function public.quotes_set_inventory_deducted()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.inventory_deducted := new.status in ('invoiced', 'paid');
  return new;
end;
$$;

create trigger quotes_set_inventory_deducted
  before insert or update of status on public.quotes
  for each row execute function public.quotes_set_inventory_deducted();

-- Quotations can now be deleted too (releasing their reservations); invoices can't.
alter policy "Tenant isolation for draft delete" on public.quotes
  using (tenant_id = public.current_tenant_id() and status in ('draft', 'sent', 'accepted', 'cancelled'));

-- ---- save_quote (§2, §3) --------------------------------------------------------
-- Totals, in this order:
--   line net        = qty × unit price − line discount (Rs. or %)
--   subtotal        = Σ line nets
--   taxable         = subtotal − document discount (Rs. or % of subtotal; needs a reason)
--   tax             = tax-exclusive lines: share of taxable × r / 100 (added on top)
--                     tax-inclusive lines: share of taxable × r / (100 + r) (already inside)
--   grand total     = taxable + tax added on top
-- With only tax-exclusive prices this is exactly taxable × (1 + r).
-- p_items: [{ "item_id", "description", "is_labor", "quantity", "unit_price",
--             "discount_type": "percent" | "amount", "discount_value" }, ...]
create or replace function public.save_quote(
  p_customer_id uuid,
  p_items jsonb,
  p_quote_id uuid default null,
  p_stage text default 'draft',
  p_vehicle_id integer default null,
  p_custom_vehicle_notes text default null,
  p_discount_type text default 'amount',
  p_discount_value numeric default 0,
  p_notes text default null,
  p_discount_reason text default null,
  p_walk_in_name text default null,
  p_walk_in_phone text default null
)
returns public.quotes
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_tenant_id uuid := public.current_tenant_id();
  v_quote public.quotes;
  v_is_walk_in boolean;
  v_tax_rate numeric;
  v_labor_includes_tax boolean;
  v_validity integer;
  v_line_count integer;
  v_subtotal numeric;
  v_discount numeric;
  v_factor numeric;
  v_included_tax numeric;
  v_added_tax numeric;
begin
  if v_tenant_id is null then
    raise exception 'Not authenticated.' using errcode = '42501';
  end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' then
    raise exception 'Line items must be a list.' using errcode = '22023';
  end if;
  if p_discount_type not in ('amount', 'percent') or coalesce(p_discount_value, -1) < 0
     or (p_discount_type = 'percent' and p_discount_value > 100) then
    raise exception 'Enter a valid discount.' using errcode = '22023';
  end if;

  -- RLS hides other shops' customers, so this also stops cross-shop links.
  select is_walk_in into v_is_walk_in from public.customers where id = p_customer_id;
  if not found then
    raise exception 'Choose a customer.' using errcode = 'P0002';
  end if;

  select tax_rate, prices_include_tax, quote_validity_days
  into v_tax_rate, v_labor_includes_tax, v_validity
  from public.tenants where id = v_tenant_id;

  if p_quote_id is not null then
    select * into v_quote from public.quotes where id = p_quote_id for update;
    if not found then
      raise exception 'This document no longer exists.' using errcode = 'P0002';
    end if;
    if v_quote.status in ('paid', 'cancelled') then
      raise exception 'Paid and cancelled documents can''t be changed.' using errcode = '55000';
    end if;
    if v_quote.status <> 'draft' then
      v_tax_rate := v_quote.tax_rate;
    end if;
  elsif p_stage is null or p_stage not in ('draft', 'quotation', 'invoice') then
    raise exception 'Unknown document type.' using errcode = '22023';
  end if;

  create temporary table if not exists pg_temp.save_quote_lines (
    item_id uuid, description text, is_labor boolean, quantity numeric, unit_price numeric,
    discount_type text, discount_value numeric, gross numeric, discount_amount numeric,
    unit_cost numeric, price_includes_tax boolean, sort_order integer
  ) on commit drop;
  truncate pg_temp.save_quote_lines;

  insert into pg_temp.save_quote_lines
  select
    case when coalesce(l.is_labor, false) then null else l.item_id end,
    btrim(coalesce(l.description, '')),
    coalesce(l.is_labor, false),
    l.quantity,
    l.unit_price,
    coalesce(l.discount_type, 'percent'),
    coalesce(l.discount_value, 0),
    round(l.quantity * l.unit_price, 2),
    case coalesce(l.discount_type, 'percent')
      when 'amount' then round(coalesce(l.discount_value, 0), 2)
      else round(round(l.quantity * l.unit_price, 2) * coalesce(l.discount_value, 0) / 100, 2)
    end,
    case when coalesce(l.is_labor, false) then 0 else coalesce(i.cost_price, 0) end,
    case when coalesce(l.is_labor, false) then v_labor_includes_tax else coalesce(i.price_includes_tax, true) end,
    l.ord::integer
  from rows from (
    jsonb_to_recordset(p_items) as (
      item_id uuid, description text, is_labor boolean, quantity numeric, unit_price numeric,
      discount_type text, discount_value numeric
    )
  ) with ordinality as l(item_id, description, is_labor, quantity, unit_price, discount_type, discount_value, ord)
  left join public.inventory_items i on i.id = l.item_id;

  if exists (select 1 from pg_temp.save_quote_lines l where not l.is_labor and not exists (
               select 1 from public.inventory_items i where i.id = l.item_id)) then
    raise exception 'A part on this document is no longer in your inventory. Remove it and try again.' using errcode = '23503';
  end if;
  if exists (select 1 from pg_temp.save_quote_lines where description = '') then
    raise exception 'Every line needs a description.' using errcode = '22023';
  end if;
  if exists (select 1 from pg_temp.save_quote_lines where quantity is null or quantity <= 0) then
    raise exception 'Quantities must be more than 0.' using errcode = '22023';
  end if;
  if exists (select 1 from pg_temp.save_quote_lines where not is_labor and quantity <> trunc(quantity)) then
    raise exception 'Parts are sold in whole units.' using errcode = '22023';
  end if;
  if exists (select 1 from pg_temp.save_quote_lines where unit_price is null or unit_price < 0) then
    raise exception 'Prices can''t be negative.' using errcode = '22023';
  end if;
  if exists (select 1 from pg_temp.save_quote_lines
             where discount_type not in ('percent', 'amount') or discount_value < 0
                or (discount_type = 'percent' and discount_value > 100) or discount_amount > gross) then
    raise exception 'A line discount can''t be more than the line''s price.' using errcode = '22023';
  end if;

  select count(*), coalesce(sum(gross - discount_amount), 0)
  into v_line_count, v_subtotal
  from pg_temp.save_quote_lines;

  if v_line_count = 0 and (coalesce(v_quote.status, 'draft') <> 'draft' or (p_quote_id is null and p_stage <> 'draft')) then
    raise exception 'Add at least one item first.' using errcode = '22023';
  end if;

  v_discount := case p_discount_type
                  when 'percent' then round(v_subtotal * p_discount_value / 100, 2)
                  else round(p_discount_value, 2)
                end;
  if v_discount > v_subtotal then
    raise exception 'The discount can''t be more than the subtotal.' using errcode = '22023';
  end if;
  if v_discount > 0 and nullif(btrim(p_discount_reason), '') is null then
    raise exception 'Give a reason for the discount.' using errcode = '22023';
  end if;
  v_factor := case when v_subtotal > 0 then (v_subtotal - v_discount) / v_subtotal else 0 end;

  select
    coalesce(sum((gross - discount_amount) * v_factor * v_tax_rate / (100 + v_tax_rate)) filter (where price_includes_tax), 0),
    coalesce(sum((gross - discount_amount) * v_factor * v_tax_rate / 100) filter (where not price_includes_tax), 0)
  into v_included_tax, v_added_tax
  from pg_temp.save_quote_lines;

  if p_quote_id is null then
    insert into public.quotes (
      tenant_id, customer_id, vehicle_id, custom_vehicle_notes, status,
      draft_number, quotation_number, invoice_number, quoted_at, invoiced_at, valid_until,
      subtotal, tax_rate, tax_amount, discount_type, discount_value, discount_amount, discount_reason,
      total_amount, notes, walk_in_name, walk_in_phone, created_by
    )
    values (
      v_tenant_id, p_customer_id, p_vehicle_id, nullif(btrim(p_custom_vehicle_notes), ''),
      case p_stage when 'draft' then 'draft' when 'quotation' then 'sent' else 'invoiced' end,
      case when p_stage = 'draft' then public.next_document_number('D') end,
      case when p_stage = 'quotation' then public.next_document_number('Q') end,
      case when p_stage = 'invoice' then public.next_document_number('INV') end,
      case when p_stage = 'quotation' then now() end,
      case when p_stage = 'invoice' then now() end,
      case when p_stage = 'quotation' then now() + make_interval(days => v_validity) end,
      v_subtotal, v_tax_rate, round(v_included_tax + v_added_tax, 2), p_discount_type,
      p_discount_value, v_discount, case when v_discount > 0 then btrim(p_discount_reason) end,
      round(v_subtotal - v_discount + v_added_tax, 2), nullif(btrim(p_notes), ''),
      case when v_is_walk_in then nullif(btrim(p_walk_in_name), '') end,
      case when v_is_walk_in then nullif(btrim(p_walk_in_phone), '') end,
      auth.uid()
    )
    returning * into v_quote;
  else
    -- Removing the old lines gives back any stock they held.
    delete from public.quote_items where quote_id = p_quote_id;

    update public.quotes
    set customer_id = p_customer_id,
        vehicle_id = p_vehicle_id,
        custom_vehicle_notes = nullif(btrim(p_custom_vehicle_notes), ''),
        subtotal = v_subtotal,
        tax_rate = v_tax_rate,
        tax_amount = round(v_included_tax + v_added_tax, 2),
        discount_type = p_discount_type,
        discount_value = p_discount_value,
        discount_amount = v_discount,
        discount_reason = case when v_discount > 0 then btrim(p_discount_reason) end,
        total_amount = round(v_subtotal - v_discount + v_added_tax, 2),
        notes = nullif(btrim(p_notes), ''),
        walk_in_name = case when v_is_walk_in then nullif(btrim(p_walk_in_name), '') end,
        walk_in_phone = case when v_is_walk_in then nullif(btrim(p_walk_in_phone), '') end,
        updated_at = now()
    where id = p_quote_id
    returning * into v_quote;
  end if;

  -- Inserting the lines reserves (quotation) or deducts (invoice) their stock.
  insert into public.quote_items (
    tenant_id, quote_id, item_id, description, is_labor, quantity, unit_cost, unit_price,
    discount_type, discount_value, discount_amount, total_price, price_includes_tax, sort_order
  )
  select v_tenant_id, v_quote.id, item_id, description, is_labor, quantity, unit_cost, unit_price,
         discount_type, discount_value, discount_amount, gross - discount_amount, price_includes_tax, sort_order
  from pg_temp.save_quote_lines;

  return v_quote;
end;
$$;

revoke execute on function public.save_quote(uuid, jsonb, uuid, text, integer, text, text, numeric, text, text, text, text) from public, anon;
grant execute on function public.save_quote(uuid, jsonb, uuid, text, integer, text, text, numeric, text, text, text, text) to authenticated;

-- ---- convert_quote (§5) --------------------------------------------------------
--   draft → quotation: reserve (re-uses its earlier Q- number if it had one)
--   draft / quotation → invoice: release any reservation, deduct stock
--   quotation → draft (downgrade): release the reservation
create or replace function public.convert_quote(p_quote_id uuid, p_target text)
returns public.quotes
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_quote public.quotes;
  v_validity integer;
begin
  if public.current_tenant_id() is null then
    raise exception 'Not authenticated.' using errcode = '42501';
  end if;

  select * into v_quote from public.quotes where id = p_quote_id for update;
  if not found then
    raise exception 'This document no longer exists.' using errcode = 'P0002';
  end if;

  if p_target = 'draft' then
    if v_quote.status not in ('sent', 'accepted', 'cancelled') then
      raise exception 'Only quotations can be moved back to drafts.' using errcode = '55000';
    end if;
    update public.quotes
    set status = 'draft', draft_number = coalesce(draft_number, public.next_document_number('D')),
        valid_until = null, updated_at = now()
    where id = p_quote_id
    returning * into v_quote;
    return v_quote;
  end if;

  if not exists (select 1 from public.quote_items where quote_id = p_quote_id) then
    raise exception 'Add at least one item first.' using errcode = '22023';
  end if;

  if p_target = 'quotation' then
    if v_quote.status <> 'draft' then
      raise exception 'Only drafts can be turned into quotations.' using errcode = '55000';
    end if;
    select quote_validity_days into v_validity from public.tenants where id = v_quote.tenant_id;
    update public.quotes
    set status = 'sent', quotation_number = coalesce(quotation_number, public.next_document_number('Q')),
        quoted_at = now(), valid_until = now() + make_interval(days => v_validity), updated_at = now()
    where id = p_quote_id
    returning * into v_quote;
  elsif p_target = 'invoice' then
    if v_quote.status not in ('draft', 'sent', 'accepted') then
      raise exception 'Only drafts and open quotations can be invoiced.' using errcode = '55000';
    end if;
    update public.quotes
    set status = 'invoiced', invoice_number = public.next_document_number('INV'),
        invoiced_at = now(), updated_at = now()
    where id = p_quote_id
    returning * into v_quote;
  else
    raise exception 'Unknown conversion.' using errcode = '22023';
  end if;

  return v_quote;
end;
$$;

-- ---- Payment: stock was already deducted when the invoice was issued ----------
create or replace function public.process_quote_payment(
  p_quote_id uuid,
  p_payment_method text,
  p_payment_notes text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tenant_id uuid := public.current_tenant_id();
  v_status text;
begin
  if v_tenant_id is null then
    raise exception 'Not authenticated.' using errcode = '42501';
  end if;

  select status into v_status
  from public.quotes
  where id = p_quote_id and tenant_id = v_tenant_id
  for update;

  if not found then
    raise exception 'Invoice not found.' using errcode = 'P0002';
  end if;
  if v_status <> 'invoiced' then
    raise exception 'Only unpaid invoices can be marked as paid.' using errcode = '55000';
  end if;

  update public.quotes
  set status = 'paid',
      payment_method = p_payment_method,
      payment_notes = p_payment_notes,
      paid_at = now(),
      updated_at = now()
  where id = p_quote_id and tenant_id = v_tenant_id;
end;
$$;

-- ---- Dashboard metrics (§7) -------------------------------------------------------
-- Per period (today, this week from Monday, this month, this year, all time) in
-- the shop's timezone:
--   sales               invoiced documents' totals (by invoice date)
--   profit              sales excluding tax, minus cost of the parts sold
--   pendingInvoices     unpaid invoices: count and total
--   pendingQuotations   open, unexpired quotations: count and total (by quote date)
create or replace function public.dashboard_metrics()
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  with shop as (
    select timezone as tz, now() at time zone timezone as local_now
    from public.tenants where id = public.current_tenant_id()
  ),
  bounds as (
    select
      date_trunc('day', local_now) at time zone tz as day,
      date_trunc('week', local_now) at time zone tz as week,
      date_trunc('month', local_now) at time zone tz as month,
      date_trunc('year', local_now) at time zone tz as year
    from shop
  ),
  invoices as (
    select q.invoiced_at as at, q.status, q.total_amount, q.total_amount - q.tax_amount
           - coalesce((select sum(i.unit_cost * i.quantity) from public.quote_items i where i.quote_id = q.id), 0) as profit
    from public.quotes q
    where q.status in ('invoiced', 'paid')
  ),
  open_quotes as (
    select q.quoted_at as at, q.total_amount
    from public.quotes q
    where q.status in ('sent', 'accepted') and (q.valid_until is null or q.valid_until >= now())
  )
  select jsonb_build_object(
    'sales', (select jsonb_build_object(
        'day', coalesce(sum(total_amount) filter (where at >= b.day), 0),
        'week', coalesce(sum(total_amount) filter (where at >= b.week), 0),
        'month', coalesce(sum(total_amount) filter (where at >= b.month), 0),
        'year', coalesce(sum(total_amount) filter (where at >= b.year), 0),
        'all', coalesce(sum(total_amount), 0))
      from invoices, bounds b),
    'profit', (select jsonb_build_object(
        'day', coalesce(sum(profit) filter (where at >= b.day), 0),
        'week', coalesce(sum(profit) filter (where at >= b.week), 0),
        'month', coalesce(sum(profit) filter (where at >= b.month), 0),
        'year', coalesce(sum(profit) filter (where at >= b.year), 0),
        'all', coalesce(sum(profit), 0))
      from invoices, bounds b),
    'pendingInvoices', (select jsonb_build_object(
        'day', jsonb_build_object('count', count(*) filter (where at >= b.day), 'total', coalesce(sum(total_amount) filter (where at >= b.day), 0)),
        'week', jsonb_build_object('count', count(*) filter (where at >= b.week), 'total', coalesce(sum(total_amount) filter (where at >= b.week), 0)),
        'month', jsonb_build_object('count', count(*) filter (where at >= b.month), 'total', coalesce(sum(total_amount) filter (where at >= b.month), 0)),
        'year', jsonb_build_object('count', count(*) filter (where at >= b.year), 'total', coalesce(sum(total_amount) filter (where at >= b.year), 0)),
        'all', jsonb_build_object('count', count(*), 'total', coalesce(sum(total_amount), 0)))
      from invoices, bounds b where status = 'invoiced'),
    'pendingQuotations', (select jsonb_build_object(
        'day', jsonb_build_object('count', count(*) filter (where at >= b.day), 'total', coalesce(sum(total_amount) filter (where at >= b.day), 0)),
        'week', jsonb_build_object('count', count(*) filter (where at >= b.week), 'total', coalesce(sum(total_amount) filter (where at >= b.week), 0)),
        'month', jsonb_build_object('count', count(*) filter (where at >= b.month), 'total', coalesce(sum(total_amount) filter (where at >= b.month), 0)),
        'year', jsonb_build_object('count', count(*) filter (where at >= b.year), 'total', coalesce(sum(total_amount) filter (where at >= b.year), 0)),
        'all', jsonb_build_object('count', count(*), 'total', coalesce(sum(total_amount), 0)))
      from open_quotes, bounds b),
    'counts', jsonb_build_object(
      'customers', (select count(*) from public.customers where not is_walk_in),
      'products', (select count(*) from public.inventory_items),
      'quotations', (select count(*) from public.quotes where status in ('sent', 'accepted', 'cancelled')),
      'invoices', (select count(*) from public.quotes where status in ('invoiced', 'paid'))
    )
  );
$$;

revoke execute on function public.dashboard_metrics() from public, anon;
grant execute on function public.dashboard_metrics() to authenticated;
