-- Phase 17: read and helper functions for the superadmin console (service role only).

-- ---------------------------------------------------------------------------
-- Organizations list: archive filter, plan, health, tags, follow-ups and sorting
-- ---------------------------------------------------------------------------
drop function if exists public.admin_tenants(text, text, integer, integer);
create or replace function public.admin_tenants(
  p_search text,
  p_status text,
  p_limit integer,
  p_offset integer,
  -- false: live organizations, true: the archive
  p_archived boolean default false,
  p_tag uuid default null,
  -- healthy / watch / at_risk
  p_band text default null,
  -- newest / name / health / last_sign_in / sales / due
  p_sort text default 'newest'
)
returns table (
  id uuid, name text, slug text, phone text, email text, status text, status_reason text, currency text, logo_url text,
  created_at timestamptz, archived_at timestamptz, owner_name text, owner_email text,
  users bigint, invoices bigint, sales numeric, last_sign_in_at timestamptz,
  plan_name text, billing_cycle text, subscription_status text, paid_until date, next_due_date date,
  health_score integer, health_band text, tags jsonb, next_follow_up date, open_follow_ups bigint,
  total bigint
)
language sql
stable
security definer
set search_path = ''
as $$
  with base as (
    select t.*,
      coalesce(o.full_name, f.full_name) as owner_name,
      coalesce(o.email, f.email) as owner_email,
      (select count(*) from public.profiles p where p.tenant_id = t.id and p.deactivated_at is null) as users,
      (select count(*) from public.quotes q where q.tenant_id = t.id and q.status in ('invoiced', 'paid')) as invoices,
      (select coalesce(sum(q.total_amount), 0) from public.quotes q where q.tenant_id = t.id and q.status in ('invoiced', 'paid')) as sales,
      (select max(u.last_sign_in_at) from public.profiles p join auth.users u on u.id = p.id where p.tenant_id = t.id) as last_sign_in_at,
      sp.name as plan_name, s.billing_cycle, s.status as subscription_status, s.paid_until, s.next_due_date,
      h.score as health_score, h.band as health_band,
      coalesce((select jsonb_agg(jsonb_build_object('id', g.id, 'name', g.name, 'color', g.color) order by g.name)
                from public.tenant_tags tt join public.admin_tags g on g.id = tt.tag_id where tt.tenant_id = t.id), '[]'::jsonb) as tags,
      (select min(fu.due_on) from public.tenant_follow_ups fu where fu.tenant_id = t.id and fu.done_at is null) as next_follow_up,
      (select count(*) from public.tenant_follow_ups fu where fu.tenant_id = t.id and fu.done_at is null) as open_follow_ups
    from public.tenants t
    left join public.profiles o on o.id = t.owner_id
    left join lateral (
      select p.full_name, p.email from public.profiles p where p.tenant_id = t.id and p.role = 'admin' order by p.created_at limit 1
    ) f on true
    left join public.tenant_subscriptions s on s.tenant_id = t.id
    left join public.subscription_plans sp on sp.id = s.plan_id
    left join lateral (
      select hs.score, hs.band from public.tenant_health_snapshots hs where hs.tenant_id = t.id order by hs.taken_on desc limit 1
    ) h on true
    where (case when p_archived then t.archived_at is not null else t.archived_at is null end)
      and (p_status is null or t.status = p_status)
      and (p_tag is null or exists (select 1 from public.tenant_tags tt where tt.tenant_id = t.id and tt.tag_id = p_tag))
      and (p_band is null or h.band = p_band)
      and (p_search is null or p_search = '' or
           t.name ilike '%' || p_search || '%' or t.slug ilike '%' || p_search || '%'
           or coalesce(t.phone, '') ilike '%' || p_search || '%' or coalesce(t.email, '') ilike '%' || p_search || '%'
           or exists (select 1 from public.profiles p where p.tenant_id = t.id and p.email ilike '%' || p_search || '%'))
  )
  select b.id, b.name, b.slug, b.phone, b.email, b.status, b.status_reason, b.currency, b.logo_url,
    b.created_at, b.archived_at, b.owner_name, b.owner_email,
    b.users, b.invoices, b.sales, b.last_sign_in_at,
    b.plan_name, b.billing_cycle, b.subscription_status, b.paid_until, b.next_due_date,
    b.health_score, b.health_band, b.tags, b.next_follow_up, b.open_follow_ups,
    count(*) over ()
  from base b
  order by
    case when p_sort = 'name' then lower(b.name) end asc,
    case when p_sort = 'health' then b.health_score end asc nulls last,
    case when p_sort = 'last_sign_in' then b.last_sign_in_at end desc nulls last,
    case when p_sort = 'sales' then b.sales end desc,
    case when p_sort = 'due' then b.next_due_date end asc nulls last,
    case when p_sort = 'archived' then b.archived_at end desc,
    b.created_at desc
  limit greatest(least(p_limit, 100), 1) offset greatest(p_offset, 0);
$$;
revoke all on function public.admin_tenants(text, text, integer, integer, boolean, uuid, text, text) from public, anon, authenticated;
grant execute on function public.admin_tenants(text, text, integer, integer, boolean, uuid, text, text) to service_role;

-- ---------------------------------------------------------------------------
-- Users list: deactivated members and archived organizations are shown as such
-- ---------------------------------------------------------------------------
drop function if exists public.admin_users(text, integer, integer);
create or replace function public.admin_users(p_search text, p_limit integer, p_offset integer)
returns table (
  id uuid, full_name text, email text, role text, is_superadmin boolean, created_at timestamptz, last_sign_in_at timestamptz,
  deactivated_at timestamptz, tenant_id uuid, tenant_name text, tenant_status text, tenant_archived_at timestamptz, total bigint
)
language sql
stable
security definer
set search_path = ''
as $$
  select p.id, p.full_name, p.email, p.role, p.is_superadmin, p.created_at, u.last_sign_in_at,
    p.deactivated_at, t.id, t.name, t.status, t.archived_at, count(*) over ()
  from public.profiles p
  join public.tenants t on t.id = p.tenant_id
  left join auth.users u on u.id = p.id
  where p_search is null or p_search = ''
    or p.full_name ilike '%' || p_search || '%' or p.email ilike '%' || p_search || '%' or t.name ilike '%' || p_search || '%'
  order by p.created_at desc
  limit greatest(least(p_limit, 100), 1) offset greatest(p_offset, 0);
$$;
revoke all on function public.admin_users(text, integer, integer) from public, anon, authenticated;
grant execute on function public.admin_users(text, integer, integer) to service_role;

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------
-- Settings → Documents for any organization: the highest numbers already used.
create or replace function public.admin_document_number_floors(p_tenant uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'draft', coalesce(max(substring(q.draft_number from '[0-9]+$')::integer), 0),
    'quote', coalesce(max(substring(q.quotation_number from '[0-9]+$')::integer), 0),
    'invoice', coalesce(max(substring(q.invoice_number from '[0-9]+$')::integer), 0)
  )
  from public.quotes q
  where q.tenant_id = p_tenant;
$$;
revoke all on function public.admin_document_number_floors(uuid) from public, anon, authenticated;
grant execute on function public.admin_document_number_floors(uuid) to service_role;

-- RF-17.4: one organization's live health score (the list shows the daily snapshot).
create or replace function public.admin_tenant_health(p_tenant uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select private.tenant_health(p_tenant);
$$;
revoke all on function public.admin_tenant_health(uuid) from public, anon, authenticated;
grant execute on function public.admin_tenant_health(uuid) to service_role;

-- Force sign-out: ends every session of the user (refresh tokens go with them). An access token
-- already issued stays valid until it expires (up to an hour); deactivated users are also stopped by RLS.
create or replace function public.admin_force_sign_out(p_user uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  delete from auth.refresh_tokens where user_id = p_user::text;
  delete from auth.sessions where user_id = p_user;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;
revoke all on function public.admin_force_sign_out(uuid) from public, anon, authenticated;
grant execute on function public.admin_force_sign_out(uuid) to service_role;
