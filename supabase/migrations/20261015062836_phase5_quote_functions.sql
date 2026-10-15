-- =============================================================================
-- Phase 5: current document number, numbering, save + convert
-- =============================================================================

-- The number the document goes by now: INV- once invoiced, else Q-, else D-.
alter table public.quotes
  add column quote_number text not null
  generated always as (coalesce(invoice_number, quotation_number, draft_number)) stored;

-- -----------------------------------------------------------------------------
-- next_document_number('D' | 'Q' | 'INV') → 'Q-1004'
-- Per shop and series, starting at 1001. An advisory lock serialises callers
-- until the transaction ends, so two saves can't take the same number.
-- -----------------------------------------------------------------------------
create or replace function public.next_document_number(p_prefix text)
returns text
language plpgsql
volatile
security invoker
set search_path = ''
as $$
declare
  v_tenant_id uuid := public.current_tenant_id();
  v_last integer;
begin
  if v_tenant_id is null then
    raise exception 'Not authenticated.' using errcode = '42501';
  end if;
  if p_prefix is null or p_prefix not in ('D', 'Q', 'INV') then
    raise exception 'Unknown number series %.', p_prefix using errcode = '22023';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_tenant_id::text || ':' || p_prefix, 0));

  select max(substring(n from '[0-9]+$')::integer) into v_last
  from (
    select case p_prefix
             when 'D' then q.draft_number
             when 'Q' then q.quotation_number
             else q.invoice_number
           end as n
    from public.quotes q
    where q.tenant_id = v_tenant_id
  ) numbers
  where n is not null;

  return p_prefix || '-' || (coalesce(v_last, 1000) + 1);
end;
$$;

-- -----------------------------------------------------------------------------
-- save_quote: create or update a document and its lines in one transaction.
-- Totals are worked out here, not trusted from the client:
--   subtotal  = Σ qty × unit price (prices as entered)
--   discount  = Rs. amount, or % of subtotal; spread across lines pro rata
--   tax       = tax-inclusive lines: net × r / (100 + r)  (already in the price)
--               tax-exclusive lines: net × r / 100         (added on top)
--   total     = subtotal − discount + tax on tax-exclusive lines
-- Parts take cost and tax treatment from inventory; labour lines follow the
-- shop's "prices include tax" setting. Drafts use the shop's current tax
-- rate; quotations and invoices keep the rate they were issued with.
-- p_items: [{ "item_id": uuid | null, "description": text, "is_labor": bool,
--             "quantity": number, "unit_price": number }, ...]
-- -----------------------------------------------------------------------------
create or replace function public.save_quote(
  p_customer_id uuid,
  p_items jsonb,
  p_quote_id uuid default null,           -- null = create
  p_stage text default 'draft',           -- create only: draft | quotation | invoice
  p_vehicle_id integer default null,
  p_custom_vehicle_notes text default null,
  p_discount_type text default 'amount',
  p_discount_value numeric default 0,
  p_notes text default null
)
returns public.quotes
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_tenant_id uuid := public.current_tenant_id();
  v_quote public.quotes;
  v_tax_rate numeric;
  v_labor_includes_tax boolean;
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
  perform 1 from public.customers where id = p_customer_id;
  if not found then
    raise exception 'Choose a customer.' using errcode = 'P0002';
  end if;

  select tax_rate, prices_include_tax into v_tax_rate, v_labor_includes_tax
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

  -- Validate and price the lines.
  create temporary table if not exists pg_temp.save_quote_lines (
    item_id uuid, description text, is_labor boolean, quantity numeric,
    unit_price numeric, unit_cost numeric, price_includes_tax boolean, sort_order integer
  ) on commit drop;
  truncate pg_temp.save_quote_lines;

  insert into pg_temp.save_quote_lines
  select
    case when coalesce(l.is_labor, false) then null else l.item_id end,
    btrim(coalesce(l.description, '')),
    coalesce(l.is_labor, false),
    l.quantity,
    l.unit_price,
    case when coalesce(l.is_labor, false) then 0 else coalesce(i.cost_price, 0) end,
    case when coalesce(l.is_labor, false) then v_labor_includes_tax else coalesce(i.price_includes_tax, true) end,
    l.ord::integer
  from jsonb_to_recordset(p_items) with ordinality
    as l(item_id uuid, description text, is_labor boolean, quantity numeric, unit_price numeric, ord bigint)
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
  if exists (select 1 from pg_temp.save_quote_lines where unit_price is null or unit_price < 0) then
    raise exception 'Prices can''t be negative.' using errcode = '22023';
  end if;

  select count(*), coalesce(sum(round(quantity * unit_price, 2)), 0)
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
  v_factor := case when v_subtotal > 0 then (v_subtotal - v_discount) / v_subtotal else 0 end;

  select
    coalesce(sum(round(quantity * unit_price, 2) * v_factor * v_tax_rate / (100 + v_tax_rate)) filter (where price_includes_tax), 0),
    coalesce(sum(round(quantity * unit_price, 2) * v_factor * v_tax_rate / 100) filter (where not price_includes_tax), 0)
  into v_included_tax, v_added_tax
  from pg_temp.save_quote_lines;

  if p_quote_id is null then
    insert into public.quotes (
      tenant_id, customer_id, vehicle_id, custom_vehicle_notes, status,
      draft_number, quotation_number, invoice_number, quoted_at, invoiced_at,
      subtotal, tax_rate, tax_amount, discount_type, discount_value, discount_amount, total_amount,
      notes, created_by
    )
    values (
      v_tenant_id, p_customer_id, p_vehicle_id, nullif(btrim(p_custom_vehicle_notes), ''),
      case p_stage when 'draft' then 'draft' when 'quotation' then 'sent' else 'invoiced' end,
      case when p_stage = 'draft' then public.next_document_number('D') end,
      case when p_stage = 'quotation' then public.next_document_number('Q') end,
      case when p_stage = 'invoice' then public.next_document_number('INV') end,
      case when p_stage = 'quotation' then now() end,
      case when p_stage = 'invoice' then now() end,
      v_subtotal, v_tax_rate, round(v_included_tax + v_added_tax, 2), p_discount_type,
      p_discount_value, v_discount, round(v_subtotal - v_discount + v_added_tax, 2),
      nullif(btrim(p_notes), ''), auth.uid()
    )
    returning * into v_quote;
  else
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
        total_amount = round(v_subtotal - v_discount + v_added_tax, 2),
        notes = nullif(btrim(p_notes), ''),
        updated_at = now()
    where id = p_quote_id
    returning * into v_quote;

    delete from public.quote_items where quote_id = p_quote_id;
  end if;

  insert into public.quote_items (
    tenant_id, quote_id, item_id, description, is_labor, quantity,
    unit_cost, unit_price, total_price, price_includes_tax, sort_order
  )
  select v_tenant_id, v_quote.id, item_id, description, is_labor, quantity,
         unit_cost, unit_price, round(quantity * unit_price, 2), price_includes_tax, sort_order
  from pg_temp.save_quote_lines;

  return v_quote;
end;
$$;

-- -----------------------------------------------------------------------------
-- convert_quote: Draft → Quotation, Draft → Invoice, Quotation → Invoice.
-- The row keeps its earlier numbers, so an invoice shows "from Q-1004".
-- -----------------------------------------------------------------------------
create or replace function public.convert_quote(p_quote_id uuid, p_target text)
returns public.quotes
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_quote public.quotes;
begin
  if public.current_tenant_id() is null then
    raise exception 'Not authenticated.' using errcode = '42501';
  end if;

  select * into v_quote from public.quotes where id = p_quote_id for update;
  if not found then
    raise exception 'This document no longer exists.' using errcode = 'P0002';
  end if;
  if not exists (select 1 from public.quote_items where quote_id = p_quote_id) then
    raise exception 'Add at least one item first.' using errcode = '22023';
  end if;

  if p_target = 'quotation' then
    if v_quote.status <> 'draft' then
      raise exception 'Only drafts can be turned into quotations.' using errcode = '55000';
    end if;
    update public.quotes
    set status = 'sent', quotation_number = public.next_document_number('Q'),
        quoted_at = now(), updated_at = now()
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

revoke execute on function public.next_document_number(text) from public, anon;
grant execute on function public.next_document_number(text) to authenticated;
revoke execute on function public.save_quote(uuid, jsonb, uuid, text, integer, text, text, numeric, text) from public, anon;
grant execute on function public.save_quote(uuid, jsonb, uuid, text, integer, text, text, numeric, text) to authenticated;
revoke execute on function public.convert_quote(uuid, text) from public, anon;
grant execute on function public.convert_quote(uuid, text) to authenticated;
