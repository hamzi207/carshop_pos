-- =============================================================================
-- Inventory search across SKU, name and linked vehicles (make / model / trim / year)
-- =============================================================================
-- An item matches when EVERY word of the query appears in its SKU + name plus
-- ONE linked vehicle, so "tint corolla 2025" finds a tint linked to the 2025
-- Corolla but not one linked only to the 2019 Corolla. Universal items have no
-- vehicle rows and match on SKU + name only.
-- Punctuation is stripped on both sides ("f150" finds "F-150"), and strpos()
-- matches literally, so no LIKE escaping is needed.
-- Returns inventory_items rows so PostgREST can still embed the fitment
-- relations and apply filters / ordering. SECURITY INVOKER: RLS limits it to
-- the caller's shop.
create or replace function public.search_inventory_items(p_query text)
returns setof public.inventory_items
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
  select i.*
  from public.inventory_items i
  where exists (
    select 1
    from (
      select null::integer as vehicle_id
      union all
      select c.vehicle_id
      from public.item_vehicle_compatibility c
      where c.item_id = i.id
    ) fit
    left join public.vehicles v on v.id = fit.vehicle_id
    where not exists (
      select 1
      from tokens t
      where strpos(
        regexp_replace(
          lower(concat_ws(' ', i.sku, i.name, v.make, v.model, v."trim", v.year::text)),
          '[^[:alnum:][:space:]]', '', 'g'
        ),
        t.token
      ) = 0
    )
  );
$$;

revoke execute on function public.search_inventory_items(text) from public, anon;
grant execute on function public.search_inventory_items(text) to authenticated;
