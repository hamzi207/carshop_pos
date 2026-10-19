-- Phase 13: superadmin control plane (/admin): impersonation ("Login As"), suspended shops,
-- and the read-only platform queries behind the admin pages.

-- ---------------------------------------------------------------------------
-- Impersonation sessions
-- ---------------------------------------------------------------------------
-- A superadmin acting as a shop. The server keeps the raw token in the httpOnly cookie
-- `carshop_impersonation` and sends it on every Supabase request as the
-- `x-carshop-impersonation` header; only its SHA-256 is stored here. Written by the server
-- with the service role (after requireSuperadmin()), never by clients.
create table public.impersonation_sessions (
  id uuid primary key default gen_random_uuid(),
  token_hash text not null unique,
  admin_id uuid not null references auth.users (id) on delete cascade,
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  started_at timestamptz not null default now(),
  expires_at timestamptz not null,
  ended_at timestamptz,
  ip_address inet
);
create index impersonation_sessions_admin_idx on public.impersonation_sessions (admin_id) where ended_at is null;
alter table public.impersonation_sessions enable row level security;
revoke all on public.impersonation_sessions from public, anon, authenticated;
grant all on public.impersonation_sessions to service_role;

-- The shop this request is impersonating, or null. Valid only when the header's token belongs to the
-- signed-in user, that user is (still) a superadmin, and the session hasn't ended or expired.
-- Without the header it returns at once, so normal requests pay almost nothing.
create or replace function private.impersonated_tenant_id()
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_token text := nullif(current_setting('request.headers', true), '')::json ->> 'x-carshop-impersonation';
  v_tenant_id uuid;
begin
  if v_token is null or auth.uid() is null then
    return null;
  end if;
  select s.tenant_id into v_tenant_id
  from public.impersonation_sessions s
  join public.profiles p on p.id = s.admin_id and p.is_superadmin
  where s.token_hash = encode(extensions.digest(v_token, 'sha256'), 'hex')
    and s.admin_id = auth.uid()
    and s.ended_at is null
    and s.expires_at > now();
  return v_tenant_id;
end;
$$;
revoke all on function private.impersonated_tenant_id() from public, anon;
grant execute on function private.impersonated_tenant_id() to authenticated, service_role;

-- RLS's shop: the impersonated shop for a superadmin acting as one, otherwise the caller's own shop
-- unless it is suspended (a suspended shop's users then see and change nothing).
create or replace function private.current_tenant_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    private.impersonated_tenant_id(),
    (select p.tenant_id
     from public.profiles p
     join public.tenants t on t.id = p.tenant_id
     where p.id = auth.uid() and t.status <> 'suspended')
  );
$$;

-- "Is the caller an admin of the current shop?" A superadmin acting as a shop counts as its admin.
-- Replaces the policies' own profiles lookups, which can't see the superadmin's profile (it belongs
-- to another shop) while impersonating.
create or replace function private.is_shop_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.impersonated_tenant_id() is not null
    or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin');
$$;
revoke all on function private.is_shop_admin() from public, anon;
grant execute on function private.is_shop_admin() to authenticated, service_role;

drop policy "Admins can update their own tenant" on public.tenants;
create policy "Admins can update their own tenant" on public.tenants
  for update to authenticated
  using (id = private.current_tenant_id() and private.is_shop_admin())
  with check (id = private.current_tenant_id());

drop policy "Admins manage categories insert" on public.categories;
create policy "Admins manage categories insert" on public.categories
  for insert to authenticated
  with check (tenant_id = private.current_tenant_id() and private.is_shop_admin());

drop policy "Admins manage categories update" on public.categories;
create policy "Admins manage categories update" on public.categories
  for update to authenticated
  using (tenant_id = private.current_tenant_id() and private.is_shop_admin())
  with check (tenant_id = private.current_tenant_id());

drop policy "Admins manage categories delete" on public.categories;
create policy "Admins manage categories delete" on public.categories
  for delete to authenticated
  using (tenant_id = private.current_tenant_id() and private.is_shop_admin());

drop policy "Admins view their shop's email log" on public.email_logs;
create policy "Admins view their shop's email log" on public.email_logs
  for select to authenticated
  using (tenant_id = private.current_tenant_id() and private.is_shop_admin());

-- ---------------------------------------------------------------------------
-- Sign-in check for suspended shops
-- ---------------------------------------------------------------------------
-- The caller's own shop status ('active' | 'suspended' | 'trial'), or null without a shop.
-- RLS hides a suspended shop from its users, so the login page asks this instead.
create or replace function public.my_shop_status()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select t.status
  from public.profiles p
  join public.tenants t on t.id = p.tenant_id
  where p.id = auth.uid();
$$;
revoke all on function public.my_shop_status() from public, anon;
grant execute on function public.my_shop_status() to authenticated;

-- ---------------------------------------------------------------------------
-- Platform queries for /admin (service role only; the pages call requireSuperadmin() first)
-- ---------------------------------------------------------------------------
-- KPIs: shops by status, users, sign-ins in the last 30 days, sales per currency, document totals,
-- and shop sign-ups per month for the last 12 months.
create or replace function public.admin_platform_metrics()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'shops', (select jsonb_build_object(
        'total', count(*),
        'active', count(*) filter (where status = 'active'),
        'trial', count(*) filter (where status = 'trial'),
        'suspended', count(*) filter (where status = 'suspended'),
        'newThisMonth', count(*) filter (where created_at >= date_trunc('month', now())))
      from public.tenants),
    'users', (select jsonb_build_object(
        'total', count(*),
        'active30', count(*) filter (where u.last_sign_in_at > now() - interval '30 days'))
      from public.profiles p join auth.users u on u.id = p.id),
    -- Shops can price in different currencies, so sales are summed per currency.
    'sales', coalesce((select jsonb_agg(row_to_json(s) order by s.total desc) from (
        select t.currency,
               sum(q.total_amount) as total,
               sum(q.total_amount) filter (where coalesce(q.invoiced_at, q.created_at) >= date_trunc('month', now())) as "thisMonth",
               sum(q.amount_paid) as collected,
               count(*) as invoices
        from public.quotes q join public.tenants t on t.id = q.tenant_id
        where q.status in ('invoiced', 'paid')
        group by t.currency) s), '[]'::jsonb),
    'documents', (select jsonb_build_object(
        'drafts', count(*) filter (where status = 'draft'),
        'quotations', count(*) filter (where status in ('sent', 'accepted')),
        'quotationsValue', coalesce(sum(total_amount) filter (where status in ('sent', 'accepted')), 0),
        'invoices', count(*) filter (where status in ('invoiced', 'paid')))
      from public.quotes),
    'signups', (select jsonb_agg(jsonb_build_object('month', to_char(m, 'YYYY-MM'), 'count',
          (select count(*) from public.tenants t where date_trunc('month', t.created_at) = m)) order by m)
      from generate_series(date_trunc('month', now()) - interval '11 months', date_trunc('month', now()), interval '1 month') m)
  );
$$;

-- Shops for /admin/tenants: search by name, handle, phone, email or owner email; filter by status.
create or replace function public.admin_tenants(p_search text, p_status text, p_limit integer, p_offset integer)
returns table (
  id uuid, name text, slug text, phone text, email text, status text, currency text, logo_url text,
  created_at timestamptz, owner_name text, owner_email text, users bigint, invoices bigint,
  sales numeric, last_sign_in_at timestamptz, total bigint
)
language sql
stable
security definer
set search_path = ''
as $$
  with matches as (
    select t.*,
      (select p.full_name from public.profiles p where p.tenant_id = t.id and p.role = 'admin' order by p.created_at limit 1) as owner_name,
      (select p.email from public.profiles p where p.tenant_id = t.id and p.role = 'admin' order by p.created_at limit 1) as owner_email
    from public.tenants t
    where (p_status is null or t.status = p_status)
      and (p_search is null or p_search = '' or
           t.name ilike '%' || p_search || '%' or t.slug ilike '%' || p_search || '%'
           or coalesce(t.phone, '') ilike '%' || p_search || '%' or coalesce(t.email, '') ilike '%' || p_search || '%'
           or exists (select 1 from public.profiles p where p.tenant_id = t.id and p.email ilike '%' || p_search || '%'))
  )
  select m.id, m.name, m.slug, m.phone, m.email, m.status, m.currency, m.logo_url, m.created_at,
    m.owner_name, m.owner_email,
    (select count(*) from public.profiles p where p.tenant_id = m.id),
    (select count(*) from public.quotes q where q.tenant_id = m.id and q.status in ('invoiced', 'paid')),
    (select coalesce(sum(q.total_amount), 0) from public.quotes q where q.tenant_id = m.id and q.status in ('invoiced', 'paid')),
    (select max(u.last_sign_in_at) from public.profiles p join auth.users u on u.id = p.id where p.tenant_id = m.id),
    count(*) over ()
  from matches m
  order by m.created_at desc
  limit greatest(least(p_limit, 100), 1) offset greatest(p_offset, 0);
$$;

-- Users across all shops for /admin/users: search by name, email or shop name.
create or replace function public.admin_users(p_search text, p_limit integer, p_offset integer)
returns table (
  id uuid, full_name text, email text, role text, is_superadmin boolean, created_at timestamptz,
  last_sign_in_at timestamptz, tenant_id uuid, tenant_name text, tenant_status text, total bigint
)
language sql
stable
security definer
set search_path = ''
as $$
  select p.id, p.full_name, p.email, p.role, p.is_superadmin, p.created_at, u.last_sign_in_at,
    t.id, t.name, t.status, count(*) over ()
  from public.profiles p
  join public.tenants t on t.id = p.tenant_id
  left join auth.users u on u.id = p.id
  where p_search is null or p_search = ''
    or p.full_name ilike '%' || p_search || '%' or p.email ilike '%' || p_search || '%' or t.name ilike '%' || p_search || '%'
  order by p.created_at desc
  limit greatest(least(p_limit, 100), 1) offset greatest(p_offset, 0);
$$;

revoke all on function public.admin_platform_metrics() from public, anon, authenticated;
revoke all on function public.admin_tenants(text, text, integer, integer) from public, anon, authenticated;
revoke all on function public.admin_users(text, integer, integer) from public, anon, authenticated;
grant execute on function public.admin_platform_metrics() to service_role;
grant execute on function public.admin_tenants(text, text, integer, integer) to service_role;
grant execute on function public.admin_users(text, integer, integer) to service_role;
