-- =============================================================================
-- PROJECT_SPEC.md §3.3 — Atomic stock deduction when an invoice is paid
-- =============================================================================
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
  v_tenant_id uuid;
  v_already_deducted boolean;
  v_item record;
begin
  -- Validate tenant context
  v_tenant_id := public.current_tenant_id();

  if v_tenant_id is null then
    raise exception 'Not authenticated.';
  end if;

  -- Lock the quote row for update
  select inventory_deducted into v_already_deducted
  from public.quotes
  where id = p_quote_id and tenant_id = v_tenant_id
  for update;

  if not found then
    raise exception 'Quote not found or unauthorized.';
  end if;

  if v_already_deducted then
    raise exception 'Inventory for this invoice has already been deducted.';
  end if;

  -- Loop through physical inventory items in the quote
  for v_item in
    select item_id, quantity
    from public.quote_items
    where quote_id = p_quote_id
      and item_id is not null
      and is_labor = false
  loop
    -- Deduct stock directly with atomic decrement
    -- (quantity_on_hand >= 0 check constraint aborts the whole payment if stock would go negative)
    update public.inventory_items
    set quantity_on_hand = quantity_on_hand - v_item.quantity,
        updated_at = now()
    where id = v_item.item_id and tenant_id = v_tenant_id;
  end loop;

  -- Mark invoice as paid and inventory as deducted
  update public.quotes
  set status = 'paid',
      payment_method = p_payment_method,
      payment_notes = p_payment_notes,
      paid_at = now(),
      inventory_deducted = true,
      updated_at = now()
  where id = p_quote_id and tenant_id = v_tenant_id;
end;
$$;

revoke execute on function public.process_quote_payment(uuid, text, text) from public, anon;
grant execute on function public.process_quote_payment(uuid, text, text) to authenticated;
