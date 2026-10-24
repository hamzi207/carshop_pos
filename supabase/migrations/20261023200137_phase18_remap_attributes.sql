-- Phase 18 fix: changing an organization's industry left its attributes behind.
--  * Its own attributes kept pointing at the old catalog (outside its tree), and the ones on its own
--    categories under the old catalog were cascade-deleted with them.
--  * Item values under the old industry's attribute keys became "Unknown attribute", so those items
--    (and the move itself, which updates their category) could no longer be saved.
-- Now: an own attribute follows its category's mapping, or is archived (no category) when that category
-- had no items; old-industry attributes that items still hold values for are kept as archived own
-- attributes, so the values stay. An active own key the new industry already has is refused up front;
-- an archived one gives way to the industry's definition.
create or replace function public.admin_remap_tenant_industry(p_tenant uuid, p_new_industry uuid, p_mapping jsonb)
returns integer
language plpgsql
set search_path = ''
as $$
declare
  v_old_industry uuid;
  v_missing integer;
  v_moved integer;
  v_clash text;
begin
  select industry_id into v_old_industry from public.tenants where id = p_tenant for update;
  if not found then
    raise exception 'Organization not found.' using errcode = 'P0002';
  end if;
  if not exists (select 1 from public.industries where id = p_new_industry) then
    raise exception 'Industry not found.' using errcode = 'P0002';
  end if;
  if v_old_industry = p_new_industry then
    return 0;
  end if;

  -- Categories that go away: the old catalog and the organization's own categories below it.
  drop table if exists pg_temp._dying;
  create temp table _dying on commit drop as
  with recursive own_under as (
    select c.id from public.categories c
    join public.categories parent on parent.id = c.parent_id
    where c.tenant_id = p_tenant and parent.tenant_id is null
    union all
    select c.id from public.categories c join own_under o on c.parent_id = o.id
  )
  select id from own_under
  union
  select id from public.categories where industry_id = v_old_industry;

  -- Every dying category in use needs a target in the new catalog or the organization's surviving own categories.
  select count(*) into v_missing
  from (select distinct i.category_id from public.inventory_items i
        where i.tenant_id = p_tenant and i.category_id in (select id from _dying)) used
  left join public.categories target on target.id = (p_mapping ->> used.category_id::text)::uuid
  where target.id is null
     or target.is_archived
     or target.id in (select id from _dying)
     or not (target.industry_id = p_new_industry or target.tenant_id = p_tenant);
  if v_missing > 0 then
    raise exception '% categories in use still need a valid new category.', v_missing using errcode = '22023';
  end if;

  -- An own attribute key can't repeat one of the new industry's keys (archived ones give way below).
  select string_agg(distinct a.label, ', ') into v_clash
  from public.category_attributes a
  join public.category_attributes n on n.industry_id = p_new_industry and n.key = a.key
  where a.tenant_id = p_tenant and not a.is_archived;
  if v_clash is not null then
    raise exception 'The new industry already has attributes with the same key as this organization''s own: %. Delete those first.', v_clash
      using errcode = '23505';
  end if;

  update public.tenants set industry_id = p_new_industry, updated_at = now() where id = p_tenant;
  delete from public.tenant_hidden_categories where tenant_id = p_tenant;
  -- Archived own attributes whose key the new industry has: its definition carries their values now.
  delete from public.category_attributes a
  where a.tenant_id = p_tenant and a.is_archived
    and exists (select 1 from public.category_attributes n where n.industry_id = p_new_industry and n.key = a.key);

  -- Old-industry attributes the items still hold values for become archived own attributes (before the
  -- items move: their values must stay known). Keys the new industry has are carried by its definitions.
  insert into public.category_attributes (tenant_id, category_id, key, label, type, options, is_required, show_on_documents, sort_order, is_archived)
  select p_tenant, null, a.key, a.label, a.type, a.options, false, a.show_on_documents, a.sort_order, true
  from public.category_attributes a
  where a.industry_id = v_old_industry
    and not exists (select 1 from public.category_attributes n where n.industry_id = p_new_industry and n.key = a.key)
    and not exists (select 1 from public.category_attributes o where o.tenant_id = p_tenant and o.key = a.key)
    and exists (select 1 from public.inventory_items i where i.tenant_id = p_tenant and i.attributes ? a.key);

  update public.inventory_items i
  set category_id = (p_mapping ->> i.category_id::text)::uuid, updated_at = now()
  where i.tenant_id = p_tenant and i.category_id in (select id from _dying);
  get diagnostics v_moved = row_count;

  -- Own attributes on dying categories follow the mapping, or are archived without a category.
  update public.category_attributes a
  set category_id = (p_mapping ->> a.category_id::text)::uuid
  where a.tenant_id = p_tenant and a.category_id in (select id from _dying) and p_mapping ? a.category_id::text;
  update public.category_attributes a
  set category_id = null, is_archived = true
  where a.tenant_id = p_tenant and a.category_id in (select id from _dying);

  update public.category_requests set suggested_parent_id = null
  where tenant_id = p_tenant and suggested_parent_id in (select id from _dying);
  delete from public.categories where tenant_id = p_tenant and id in (select id from _dying);

  return v_moved;
end;
$$;
revoke all on function public.admin_remap_tenant_industry(uuid, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.admin_remap_tenant_industry(uuid, uuid, jsonb) to service_role;
