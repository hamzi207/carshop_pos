-- Phase 17 (deliverable 8): organizations at or near a plan limit, for the console overview.
-- Counts the same way the limit triggers do: active, non-superadmin users; every product.
create or replace function public.admin_near_limits(p_ratio numeric default 0.9)
returns table (tenant_id uuid, name text, kind text, used bigint, max integer)
language sql
stable
security definer
set search_path = ''
as $$
  with lim as (
    select t.id, t.name,
      coalesce(s.max_users, p.max_users) as max_users,
      coalesce(s.max_products, p.max_products) as max_products
    from public.tenants t
    join public.tenant_subscriptions s on s.tenant_id = t.id
    join public.subscription_plans p on p.id = s.plan_id
    where t.archived_at is null
  ), used as (
    select l.*,
      (select count(*) from public.profiles x where x.tenant_id = l.id and x.deactivated_at is null and not x.is_superadmin) as users,
      (select count(*) from public.inventory_items i where i.tenant_id = l.id) as products
    from lim l
    where l.max_users is not null or l.max_products is not null
  )
  select id, name, 'users', users, max_users from used where max_users is not null and users >= ceil(max_users * p_ratio)
  union all
  select id, name, 'products', products, max_products from used where max_products is not null and products >= ceil(max_products * p_ratio)
  order by 4 desc
  limit 50;
$$;
revoke all on function public.admin_near_limits(numeric) from public, anon, authenticated;
grant execute on function public.admin_near_limits(numeric) to service_role;
