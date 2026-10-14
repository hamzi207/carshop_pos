-- =============================================================================
-- PROJECT_SPEC.md Phase 3 — Atomic inventory save (item + vehicle fitment)
-- =============================================================================
-- Creates (p_item_id null) or updates an inventory item and replaces its
-- vehicle compatibility rows in one transaction, so an item can never be left
-- "vehicle specific" with no vehicles (or with half its links written).
--
-- SECURITY INVOKER: runs as the caller, so the inventory and compatibility RLS
-- policies still apply; tenant_id always comes from current_tenant_id(), never
-- from the client.
create or replace function public.save_inventory_item(
  p_item_id uuid,
  p_sku text,
  p_name text,
  p_description text,
  p_category text,
  p_cost_price numeric,
  p_selling_price numeric,
  p_quantity_on_hand integer,
  p_low_stock_threshold integer,
  p_is_universal boolean,
  p_vehicle_ids integer[]
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
      quantity_on_hand, low_stock_threshold, is_universal
    )
    values (
      v_tenant_id, p_sku, p_name, p_description, p_category, p_cost_price, p_selling_price,
      p_quantity_on_hand, p_low_stock_threshold, p_is_universal
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

revoke execute on function public.save_inventory_item(uuid, text, text, text, text, numeric, numeric, integer, integer, boolean, integer[]) from public, anon;
grant execute on function public.save_inventory_item(uuid, text, text, text, text, numeric, numeric, integer, integer, boolean, integer[]) to authenticated;
