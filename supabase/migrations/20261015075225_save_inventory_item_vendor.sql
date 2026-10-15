-- save_inventory_item: adds p_vendor_name (docs/changes.md §6). Same body
-- otherwise; the old signature is dropped in the next migration. Lowering
-- stock below what open quotations have reserved fails on
-- inventory_reserved_within_stock.
create or replace function public.save_inventory_item(
  p_sku text,
  p_name text,
  p_category text,
  p_cost_price numeric,
  p_selling_price numeric,
  p_quantity_on_hand integer,
  p_low_stock_threshold integer,
  p_is_universal boolean,
  p_item_id uuid default null,
  p_description text default null,
  p_vehicle_ids integer[] default '{}',
  p_price_includes_tax boolean default true,
  p_vendor_name text default null
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
      quantity_on_hand, low_stock_threshold, is_universal, price_includes_tax, vendor_name
    )
    values (
      v_tenant_id, p_sku, p_name, p_description, p_category, p_cost_price, p_selling_price,
      p_quantity_on_hand, p_low_stock_threshold, p_is_universal, p_price_includes_tax,
      nullif(btrim(p_vendor_name), '')
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
        vendor_name = nullif(btrim(p_vendor_name), ''),
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

revoke execute on function public.save_inventory_item(text, text, text, numeric, numeric, integer, integer, boolean, uuid, text, integer[], boolean, text) from public, anon;
grant execute on function public.save_inventory_item(text, text, text, numeric, numeric, integer, integer, boolean, uuid, text, integer[], boolean, text) to authenticated;
