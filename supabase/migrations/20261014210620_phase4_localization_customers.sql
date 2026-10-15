-- =============================================================================
-- Phase 4 — Pakistan localization (PROJECT_SPEC.md §2.3) + customer directory
-- =============================================================================

-- ---- Shop settings ----------------------------------------------------------
update public.tenants set currency = 'Rs.' where currency not in ('Rs.', 'PKR');
alter table public.tenants alter column currency set default 'Rs.';
alter table public.tenants add constraint tenants_currency_check check (currency in ('Rs.', 'PKR'));
alter table public.tenants add constraint tenants_tax_rate_check check (tax_rate between 0 and 100);

alter table public.tenants
  add column timezone text not null default 'Asia/Karachi',
  -- Show amounts with paisa (Rs. 12,500.00) or whole rupees (Rs. 12,500).
  add column show_paisa boolean not null default true,
  -- Default for new products: selling price already includes tax.
  add column prices_include_tax boolean not null default true,
  -- Off: only Pakistani numbers. On: +country-code numbers are accepted too.
  add column allow_international_phones boolean not null default false;

-- Admin-only via the existing "Admins can update their own tenant" policy.
-- timezone stays read-only for now (fixed to Asia/Karachi).
grant update (show_paisa, prices_include_tax, allow_international_phones) on public.tenants to authenticated;

-- ---- Inventory: tax-inclusive pricing per product --------------------------
alter table public.inventory_items
  add column price_includes_tax boolean not null default true;

-- ---- Customers: phones are stored normalized in E.164 (+923001234567) -------
alter table public.customers
  add constraint customers_whatsapp_e164_check check (whatsapp_number ~ '^\+[1-9][0-9]{7,14}$'),
  add constraint customers_phone_e164_check check (phone is null or phone ~ '^\+[1-9][0-9]{7,14}$');

-- -----------------------------------------------------------------------------
-- Customer search: every word must appear in the name, contact, email, tax ID
-- or a phone number. Phones match in both the stored form (923001234567) and
-- the Pakistani local form (03001234567); punctuation is ignored on both sides,
-- so "0300-123" finds +923001234567. SECURITY INVOKER: RLS scopes it to the
-- caller's shop. Returns customers rows so PostgREST can still embed quotes.
-- -----------------------------------------------------------------------------
create or replace function public.search_customers(p_query text)
returns setof public.customers
language sql
stable
security invoker
set search_path = ''
as $$
  with tokens as (
    select distinct token
    from unnest(
      regexp_split_to_array(
        regexp_replace(lower(coalesce(p_query, '')), '[^[:alnum:][:space:]]', '', 'g'),
        '\s+'
      )
    ) as token
    where token <> ''
  )
  select c.*
  from public.customers c
  where not exists (
    select 1
    from tokens t
    where strpos(
      regexp_replace(
        lower(concat_ws(' ',
          c.name, c.contact_person, c.email, c.tax_id,
          c.whatsapp_number,
          case when c.whatsapp_number like '+92%' then '0' || substr(c.whatsapp_number, 4) end,
          c.phone,
          case when c.phone like '+92%' then '0' || substr(c.phone, 4) end
        )),
        '[^[:alnum:][:space:]]', '', 'g'
      ),
      t.token
    ) = 0
  );
$$;

revoke execute on function public.search_customers(text) from public, anon;
grant execute on function public.search_customers(text) to authenticated;

-- -----------------------------------------------------------------------------
-- save_inventory_item gains p_price_includes_tax (last, defaulted). The old
-- signature is dropped in the next migration.
-- -----------------------------------------------------------------------------
create function public.save_inventory_item(
  p_sku text,
  p_name text,
  p_category text,
  p_cost_price numeric,
  p_selling_price numeric,
  p_quantity_on_hand integer,
  p_low_stock_threshold integer,
  p_is_universal boolean,
  p_item_id uuid default null,        -- null = create
  p_description text default null,
  p_vehicle_ids integer[] default '{}',
  p_price_includes_tax boolean default true
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_tenant_id uuid := public.current_tenant_id();
  v_item_id uuid;
begin
  if v_tenant_id is null then
    raise exception 'Not authenticated.' using errcode = '42501';
  end if;

  if not p_is_universal and coalesce(cardinality(p_vehicle_ids), 0) = 0 then
    raise exception 'Vehicle-specific items need at least one vehicle.' using errcode = '22023';
  end if;

  if p_item_id is null then
    insert into public.inventory_items (
      tenant_id, sku, name, description, category, cost_price, selling_price,
      quantity_on_hand, low_stock_threshold, is_universal, price_includes_tax
    )
    values (
      v_tenant_id, p_sku, p_name, p_description, p_category, p_cost_price, p_selling_price,
      p_quantity_on_hand, p_low_stock_threshold, p_is_universal, p_price_includes_tax
    )
    returning id into v_item_id;
  else
    update public.inventory_items
    set sku = p_sku,
        name = p_name,
        description = p_description,
        category = p_category,
        cost_price = p_cost_price,
        selling_price = p_selling_price,
        quantity_on_hand = p_quantity_on_hand,
        low_stock_threshold = p_low_stock_threshold,
        is_universal = p_is_universal,
        price_includes_tax = p_price_includes_tax,
        updated_at = now()
    where id = p_item_id and tenant_id = v_tenant_id
    returning id into v_item_id;

    if v_item_id is null then
      raise exception 'Inventory item not found.' using errcode = 'P0002';
    end if;

    delete from public.item_vehicle_compatibility
    where item_id = v_item_id and tenant_id = v_tenant_id;
  end if;

  if not p_is_universal then
    insert into public.item_vehicle_compatibility (tenant_id, item_id, vehicle_id)
    select distinct v_tenant_id, v_item_id, vehicle_id
    from unnest(p_vehicle_ids) as vehicle_id;
  end if;

  return v_item_id;
end;
$$;

revoke execute on function public.save_inventory_item(text, text, text, numeric, numeric, integer, integer, boolean, uuid, text, integer[], boolean) from public, anon;
grant execute on function public.save_inventory_item(text, text, text, numeric, numeric, integer, integer, boolean, uuid, text, integer[], boolean) to authenticated;
