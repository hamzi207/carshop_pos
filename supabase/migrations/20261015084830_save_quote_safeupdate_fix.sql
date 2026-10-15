-- save_quote: the API's pg_safeupdate rejects UPDATE without a WHERE clause,
-- so the two updates of the temporary lines table get `where true`.
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
  p_walk_in_phone text default null,
  p_due_date date default null
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
  v_custom_includes_tax boolean;
  v_validity integer;
  v_due_days integer;
  v_today date;
  v_line_count integer;
  v_subtotal numeric;
  v_discount numeric;
  v_factor numeric;
  v_included_tax numeric;
  v_added_tax numeric;
  v_total numeric;
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

  select tax_rate, prices_include_tax, quote_validity_days, invoice_due_days, (now() at time zone timezone)::date
  into v_tax_rate, v_custom_includes_tax, v_validity, v_due_days, v_today
  from public.tenants where id = v_tenant_id;

  if p_quote_id is not null then
    select * into v_quote from public.quotes where id = p_quote_id for update;
    if not found then
      raise exception 'This document no longer exists.' using errcode = 'P0002';
    end if;
    if v_quote.status in ('paid', 'cancelled', 'void') then
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
    discount_type text, discount_value numeric, unit_discount numeric, sale_price numeric,
    gross numeric, net numeric, unit_cost numeric, price_includes_tax boolean, sort_order integer
  ) on commit drop;
  truncate pg_temp.save_quote_lines;

  insert into pg_temp.save_quote_lines (
    item_id, description, is_labor, quantity, unit_price, discount_type, discount_value,
    unit_cost, price_includes_tax, sort_order
  )
  select
    case when coalesce(l.is_labor, false) then null else l.item_id end,
    btrim(coalesce(l.description, '')),
    coalesce(l.is_labor, false),
    l.quantity,
    -- Inventory parts are always sold from their catalogue price.
    case when l.item_id is not null and not coalesce(l.is_labor, false) then i.selling_price else l.unit_price end,
    coalesce(l.discount_type, 'percent'),
    coalesce(l.discount_value, 0),
    case when l.item_id is not null and not coalesce(l.is_labor, false) then coalesce(i.cost_price, 0) else 0 end,
    case when l.item_id is not null and not coalesce(l.is_labor, false) then coalesce(i.price_includes_tax, true) else v_custom_includes_tax end,
    l.ord::integer
  from rows from (
    jsonb_to_recordset(p_items) as (
      item_id uuid, description text, is_labor boolean, quantity numeric, unit_price numeric,
      discount_type text, discount_value numeric
    )
  ) with ordinality as l(item_id, description, is_labor, quantity, unit_price, discount_type, discount_value, ord)
  left join public.inventory_items i on i.id = l.item_id;

  if exists (select 1 from pg_temp.save_quote_lines l where l.item_id is not null and not exists (
               select 1 from public.inventory_items i where i.id = l.item_id)) then
    raise exception 'A part on this document is no longer in your inventory. Remove it and try again.' using errcode = '23503';
  end if;
  if exists (select 1 from pg_temp.save_quote_lines where description = '') then
    raise exception 'Every line needs a description.' using errcode = '22023';
  end if;
  if exists (select 1 from pg_temp.save_quote_lines where quantity is null or quantity <= 0) then
    raise exception 'Quantities must be more than 0.' using errcode = '22023';
  end if;
  if exists (select 1 from pg_temp.save_quote_lines where item_id is not null and quantity <> trunc(quantity)) then
    raise exception 'Parts are sold in whole units.' using errcode = '22023';
  end if;
  if exists (select 1 from pg_temp.save_quote_lines where unit_price is null or unit_price < 0) then
    raise exception 'Prices can''t be negative.' using errcode = '22023';
  end if;
  if exists (select 1 from pg_temp.save_quote_lines
             where discount_type not in ('percent', 'amount') or discount_value < 0
                or (discount_type = 'percent' and discount_value > 100)) then
    raise exception 'Enter a valid line discount.' using errcode = '22023';
  end if;

  update pg_temp.save_quote_lines
  set unit_discount = case discount_type
                        when 'amount' then round(discount_value, 2)
                        else round(unit_price * discount_value / 100, 2)
                      end
  where true;  -- pg_safeupdate (API connections) rejects UPDATE without WHERE
  if exists (select 1 from pg_temp.save_quote_lines where unit_discount > unit_price) then
    raise exception 'A discount can''t be more than the unit price.' using errcode = '22023';
  end if;
  update pg_temp.save_quote_lines
  set sale_price = unit_price - unit_discount,
      gross = round(quantity * unit_price, 2),
      net = round(quantity * (unit_price - unit_discount), 2)
  where true;

  select count(*), coalesce(sum(net), 0) into v_line_count, v_subtotal from pg_temp.save_quote_lines;

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
    coalesce(sum(net * v_factor * v_tax_rate / (100 + v_tax_rate)) filter (where price_includes_tax), 0),
    coalesce(sum(net * v_factor * v_tax_rate / 100) filter (where not price_includes_tax), 0)
  into v_included_tax, v_added_tax
  from pg_temp.save_quote_lines;
  v_total := round(v_subtotal - v_discount + v_added_tax, 2);

  if p_quote_id is not null and v_quote.amount_paid > v_total then
    raise exception 'Payments already recorded (%) are more than the new total (%). Remove a payment first.',
      v_quote.amount_paid, v_total using errcode = '23514';
  end if;

  if p_quote_id is null then
    insert into public.quotes (
      tenant_id, customer_id, vehicle_id, custom_vehicle_notes, status,
      draft_number, quotation_number, invoice_number, quoted_at, invoiced_at, valid_until, due_date,
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
      case when p_stage = 'invoice' then coalesce(p_due_date, v_today + v_due_days) end,
      v_subtotal, v_tax_rate, round(v_included_tax + v_added_tax, 2), p_discount_type,
      p_discount_value, v_discount, case when v_discount > 0 then btrim(p_discount_reason) end,
      v_total, nullif(btrim(p_notes), ''),
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
        total_amount = v_total,
        due_date = case when status in ('invoiced', 'paid') then coalesce(p_due_date, due_date) else due_date end,
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
    discount_type, discount_value, discount_amount, sale_price, total_price, price_includes_tax, sort_order
  )
  select v_tenant_id, v_quote.id, item_id, description, is_labor, quantity, unit_cost, unit_price,
         discount_type, discount_value, gross - net, sale_price, net, price_includes_tax, sort_order
  from pg_temp.save_quote_lines;

  return v_quote;
end;
$$;

