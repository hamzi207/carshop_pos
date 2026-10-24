-- Phase 18 checkpoint fix: a category whose parent is hidden for an organization would show there as a
-- stray main category (the tree puts orphans at the top). Hiding is per category row, so new or moved
-- catalog categories under a hidden branch are hidden for that organization too; if the organization's
-- items or own categories sit in that branch, the branch above is shown again instead (as "Show" does).
-- An organization's own category can't be added under one of its hidden categories.

create function private.categories_follow_hidden()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tenant uuid;
  v_subtree uuid[];
begin
  if new.parent_id is null then
    return null;
  end if;

  if new.tenant_id is not null then
    if exists (select 1 from public.tenant_hidden_categories h where h.tenant_id = new.tenant_id and h.category_id = new.parent_id) then
      raise exception 'The parent category is hidden for this organization. Show it first.' using errcode = '22023';
    end if;
    return null;
  end if;

  with recursive sub as (
    select new.id as id
    union all
    select c.id from public.categories c join sub on c.parent_id = sub.id
  )
  select array_agg(id) into v_subtree from sub;

  for v_tenant in
    select h.tenant_id from public.tenant_hidden_categories h where h.category_id = new.parent_id
  loop
    if exists (select 1 from public.inventory_items i where i.tenant_id = v_tenant and i.category_id = any (v_subtree))
       or exists (select 1 from public.categories c where c.tenant_id = v_tenant and c.parent_id = any (v_subtree)) then
      with recursive up as (
        select new.parent_id as id
        union all
        select c.parent_id from public.categories c join up on c.id = up.id where c.parent_id is not null
      )
      delete from public.tenant_hidden_categories h where h.tenant_id = v_tenant and h.category_id in (select id from up);
    else
      insert into public.tenant_hidden_categories (tenant_id, category_id)
      select v_tenant, s from unnest(v_subtree) s
      on conflict do nothing;
    end if;
  end loop;
  return null;
end;
$$;

revoke all on function private.categories_follow_hidden() from public, anon, authenticated;

create trigger categories_follow_hidden
  after insert or update of parent_id on public.categories
  for each row execute function private.categories_follow_hidden();
