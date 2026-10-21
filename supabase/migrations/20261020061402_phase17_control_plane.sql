-- Phase 17 (part 1): superadmin full control plane.
-- Organization ownership, status reasons and archiving; read-only "Login As"; superadmin
-- two-factor (aal2) on impersonation; platform settings and announcements; superadmin notes,
-- tags and follow-ups (RF-17.2); the organization health score (RF-17.4).

-- ---------------------------------------------------------------------------
-- Organizations: owner, status reason, archive (never deleted)
-- ---------------------------------------------------------------------------
alter table public.tenants
  add column owner_id uuid references public.profiles (id) on delete set null,
  -- Shown to the organization's users while it is suspended (e.g. "Subscription unpaid").
  add column status_reason text constraint tenants_status_reason_check check (char_length(status_reason) <= 300),
  add column archived_at timestamptz,
  add column archived_by uuid references auth.users (id) on delete set null,
  add column archive_reason text constraint tenants_archive_reason_check check (char_length(archive_reason) <= 500);
create index tenants_archived_idx on public.tenants (archived_at) where archived_at is not null;
create index tenants_owner_idx on public.tenants (owner_id);

-- The owner is the earliest admin of each existing organization.
update public.tenants t
set owner_id = (select p.id from public.profiles p where p.tenant_id = t.id and p.role = 'admin' order by p.created_at limit 1)
where t.owner_id is null;

-- New organizations: the sign-up trigger creates the tenant, then its first admin. Record that admin
-- as the owner (only while the tenant has none, so team invites never change it).
create or replace function private.profiles_set_tenant_owner()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.role = 'admin' then
    update public.tenants set owner_id = new.id where id = new.tenant_id and owner_id is null;
  end if;
  return new;
end;
$$;
revoke all on function private.profiles_set_tenant_owner() from public, anon, authenticated;
create trigger profiles_set_tenant_owner
  after insert on public.profiles
  for each row execute function private.profiles_set_tenant_owner();

-- ---------------------------------------------------------------------------
-- "Login As": read-only mode, and the superadmin's session must be two-factor (aal2)
-- ---------------------------------------------------------------------------
alter table public.impersonation_sessions
  add column mode text not null default 'full' constraint impersonation_sessions_mode_check check (mode in ('full', 'read_only'));

-- The open session behind this request's header (shared by impersonated_tenant_id and impersonation_mode).
create or replace function private.impersonation_session()
returns public.impersonation_sessions
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_headers json := nullif(current_setting('request.headers', true), '')::json;
  v_token text := coalesce(v_headers ->> 'x-productlogik-impersonation', v_headers ->> 'x-carshop-impersonation');
  v_session public.impersonation_sessions;
begin
  if v_token is null or auth.uid() is null then
    return null;
  end if;
  -- RF-17.1: a superadmin password alone isn't enough to act as an organization.
  if coalesce(auth.jwt() ->> 'aal', '') <> 'aal2' then
    return null;
  end if;
  select s.* into v_session
  from public.impersonation_sessions s
  join public.profiles p on p.id = s.admin_id and p.is_superadmin
  where s.token_hash = encode(extensions.digest(v_token, 'sha256'), 'hex')
    and s.admin_id = auth.uid()
    and s.ended_at is null
    and s.expires_at > now();
  return v_session;
end;
$$;
revoke all on function private.impersonation_session() from public, anon;
grant execute on function private.impersonation_session() to authenticated, service_role;

create or replace function private.impersonated_tenant_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select (private.impersonation_session()).tenant_id;
$$;

-- 'full' | 'read_only' while impersonating, else null.
create or replace function private.impersonation_mode()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select (private.impersonation_session()).mode;
$$;
revoke all on function private.impersonation_mode() from public, anon;
grant execute on function private.impersonation_mode() to authenticated, service_role;

-- Runs before every PostgREST request (pgrst.db_pre_request). In a read-only "Login As" the whole
-- transaction becomes read only, so every insert, update, delete and write RPC fails in the
-- database, whatever the app does. Turning read-only ON mid-transaction is allowed by Postgres.
create or replace function private.pre_request()
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if private.impersonation_mode() = 'read_only' then
    perform set_config('transaction_read_only', 'on', true);
  end if;
end;
$$;
revoke all on function private.pre_request() from public, anon;
grant execute on function private.pre_request() to authenticated, anon, service_role;
grant usage on schema private to anon;
-- Switched on in the next migration (phase17_pre_request), after this function is tested.

-- RLS's organization: impersonated one, else the caller's own unless it is suspended or archived,
-- or the caller is deactivated.
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
     where p.id = auth.uid() and t.status <> 'suspended' and t.archived_at is null and p.deactivated_at is null)
  );
$$;

-- Login / session check: 'archived', 'deactivated', or the organization's status.
create or replace function public.my_shop_status()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select case
           when t.archived_at is not null then 'archived'
           when p.deactivated_at is not null then 'deactivated'
           else t.status
         end
  from public.profiles p
  join public.tenants t on t.id = p.tenant_id
  where p.id = auth.uid();
$$;

-- ---------------------------------------------------------------------------
-- Audit log: a reason for destructive or override actions
-- ---------------------------------------------------------------------------
alter table public.superadmin_audit_logs
  add column reason text constraint superadmin_audit_logs_reason_check check (char_length(reason) <= 500);
create index superadmin_audit_logs_action_idx on public.superadmin_audit_logs (action, created_at desc);
create index superadmin_audit_logs_admin_idx on public.superadmin_audit_logs (admin_id, created_at desc);
create index superadmin_audit_logs_user_idx on public.superadmin_audit_logs (target_user_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Platform settings (one row, service role only)
-- ---------------------------------------------------------------------------
create table public.platform_settings (
  id boolean primary key default true constraint platform_settings_single_row check (id),
  -- Sign-up
  signup_open boolean not null default true,
  signup_default_status text not null default 'trial' constraint platform_settings_signup_status_check check (signup_default_status in ('active', 'trial')),
  -- "Login As" length in minutes (V1: 2 hours).
  impersonation_ttl_minutes integer not null default 120 constraint platform_settings_ttl_check check (impersonation_ttl_minutes between 15 and 720),
  -- Email
  email_sender_name text not null default 'ProductLogik POS' constraint platform_settings_sender_check check (char_length(email_sender_name) between 1 and 80),
  email_reply_to text constraint platform_settings_reply_to_check check (char_length(email_reply_to) <= 200),
  email_hourly_limit integer not null default 100 constraint platform_settings_email_limit_check check (email_hourly_limit between 1 and 10000),
  -- The business that bills organizations (printed on subscription invoices and receipts).
  business_name text not null default 'ProductLogik' constraint platform_settings_business_name_check check (char_length(business_name) between 1 and 120),
  business_address text constraint platform_settings_business_address_check check (char_length(business_address) <= 300),
  business_phone text constraint platform_settings_business_phone_check check (char_length(business_phone) <= 30),
  business_email text constraint platform_settings_business_email_check check (char_length(business_email) <= 200),
  business_ntn text constraint platform_settings_business_ntn_check check (char_length(business_ntn) <= 30),
  -- Where organizations pay: [{ "provider": "JazzCash", "title": "...", "number": "03..." }]
  payment_wallets jsonb not null default '[]'::jsonb constraint platform_settings_wallets_check check (jsonb_typeof(payment_wallets) = 'array' and jsonb_array_length(payment_wallets) <= 6),
  -- [{ "bank": "...", "title": "...", "number": "...", "iban": "PK..." }]
  payment_banks jsonb not null default '[]'::jsonb constraint platform_settings_banks_check check (jsonb_typeof(payment_banks) = 'array' and jsonb_array_length(payment_banks) <= 6),
  payment_note text constraint platform_settings_payment_note_check check (char_length(payment_note) <= 500),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id) on delete set null
);
insert into public.platform_settings (id) values (true);
alter table public.platform_settings enable row level security;
revoke all on public.platform_settings from public, anon, authenticated;
grant all on public.platform_settings to service_role;

-- Sign-up page: is self-registration open? (callable before sign-in)
create or replace function public.signup_open()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select signup_open from public.platform_settings), true);
$$;
revoke all on function public.signup_open() from public;
grant execute on function public.signup_open() to anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Announcements (global; each organization reads the ones aimed at it)
-- ---------------------------------------------------------------------------
create table public.announcements (
  id uuid primary key default gen_random_uuid(),
  message text not null constraint announcements_message_check check (char_length(message) between 1 and 500),
  tone text not null default 'info' constraint announcements_tone_check check (tone in ('info', 'warning')),
  -- null = every organization; otherwise only these.
  target_tenant_ids uuid[],
  starts_at timestamptz not null default now(),
  ends_at timestamptz,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  constraint announcements_dates_check check (ends_at is null or ends_at > starts_at)
);
create index announcements_active_idx on public.announcements (starts_at, ends_at);
alter table public.announcements enable row level security;
revoke all on public.announcements from public, anon, authenticated;
grant select on public.announcements to authenticated;
grant all on public.announcements to service_role;
create policy "Organizations read their announcements" on public.announcements
  for select to authenticated
  using (
    starts_at <= now() and (ends_at is null or ends_at > now())
    and (target_tenant_ids is null or (select private.current_tenant_id()) = any (target_tenant_ids))
  );

-- ---------------------------------------------------------------------------
-- RF-17.2: superadmin notes, tags and follow-ups (service role only, never shown to the organization)
-- ---------------------------------------------------------------------------
create table public.tenant_notes (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  body text not null constraint tenant_notes_body_check check (char_length(body) between 1 and 4000),
  author_id uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  edited_at timestamptz,
  deleted_at timestamptz,
  deleted_reason text constraint tenant_notes_deleted_reason_check check (char_length(deleted_reason) <= 300)
);
create index tenant_notes_tenant_idx on public.tenant_notes (tenant_id, created_at desc);

create table public.admin_tags (
  id uuid primary key default gen_random_uuid(),
  name text not null constraint admin_tags_name_check check (char_length(name) between 1 and 30),
  color text not null default '#64748b' constraint admin_tags_color_check check (color ~ '^#[0-9a-f]{6}$'),
  created_at timestamptz not null default now()
);
create unique index admin_tags_name_key on public.admin_tags (lower(name));

create table public.tenant_tags (
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  tag_id uuid not null references public.admin_tags (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (tenant_id, tag_id)
);
create index tenant_tags_tag_idx on public.tenant_tags (tag_id);

create table public.tenant_follow_ups (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  due_on date not null,
  reason text not null constraint tenant_follow_ups_reason_check check (char_length(reason) between 1 and 300),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  done_at timestamptz,
  done_by uuid references auth.users (id) on delete set null
);
create index tenant_follow_ups_open_idx on public.tenant_follow_ups (due_on) where done_at is null;
create index tenant_follow_ups_tenant_idx on public.tenant_follow_ups (tenant_id);

insert into public.admin_tags (name, color) values ('VIP', '#7c3aed'), ('Onboarding', '#0284c7'), ('Fees due', '#dc2626');

-- ---------------------------------------------------------------------------
-- RF-17.4: organization health score
-- ---------------------------------------------------------------------------
-- 0-100 from the last 30 days: active users who signed in (40), documents per week (35, full at
-- 5 a week), setup completeness (25: profile phone + address, logo, a product, a customer, an invoice).
create or replace function private.tenant_health(p_tenant uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with u as (
    select count(*) filter (where p.deactivated_at is null) as active_users,
           count(*) filter (where p.deactivated_at is null and au.last_sign_in_at > now() - interval '30 days') as signed_in
    from public.profiles p left join auth.users au on au.id = p.id
    where p.tenant_id = p_tenant and not p.is_superadmin
  ), d as (
    select count(*) as docs from public.quotes q where q.tenant_id = p_tenant and q.created_at > now() - interval '30 days'
  ), s as (
    select
      (t.phone is not null and t.address is not null)::int as profile,
      (t.logo_url is not null)::int as logo,
      exists (select 1 from public.inventory_items i where i.tenant_id = p_tenant)::int as product,
      exists (select 1 from public.customers c where c.tenant_id = p_tenant and not c.is_walk_in)::int as customer,
      exists (select 1 from public.quotes q where q.tenant_id = p_tenant and q.invoice_number is not null)::int as invoice
    from public.tenants t where t.id = p_tenant
  ), parts as (
    select
      case when u.active_users = 0 then 0 else round(40.0 * u.signed_in / u.active_users) end as sign_ins,
      round(least(35.0, 35.0 * (d.docs / (30.0 / 7)) / 5)) as activity,
      5 * (s.profile + s.logo + s.product + s.customer + s.invoice) as setup,
      u.signed_in, u.active_users, d.docs, s.*
    from u, d, s
  )
  select jsonb_build_object(
    'score', (sign_ins + activity + setup)::int,
    'band', case when sign_ins + activity + setup >= 70 then 'healthy' when sign_ins + activity + setup >= 40 then 'watch' else 'at_risk' end,
    'parts', jsonb_build_object(
      'signIns', jsonb_build_object('points', sign_ins, 'of', 40, 'signedIn', signed_in, 'activeUsers', active_users),
      'activity', jsonb_build_object('points', activity, 'of', 35, 'documents30d', docs),
      'setup', jsonb_build_object('points', setup, 'of', 25, 'profile', profile = 1, 'logo', logo = 1, 'product', product = 1, 'customer', customer = 1, 'invoice', invoice = 1)
    )
  )
  from parts;
$$;
revoke all on function private.tenant_health(uuid) from public, anon, authenticated;
grant execute on function private.tenant_health(uuid) to service_role;

create table public.tenant_health_snapshots (
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  taken_on date not null,
  score integer not null constraint tenant_health_snapshots_score_check check (score between 0 and 100),
  band text not null constraint tenant_health_snapshots_band_check check (band in ('healthy', 'watch', 'at_risk')),
  parts jsonb not null,
  primary key (tenant_id, taken_on)
);

-- Today's snapshot for every organization that isn't archived (called by the daily job and "Refresh").
create or replace function public.admin_refresh_health(p_date date)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  insert into public.tenant_health_snapshots (tenant_id, taken_on, score, band, parts)
  select t.id, p_date, (h ->> 'score')::int, h ->> 'band', h -> 'parts'
  from public.tenants t, lateral private.tenant_health(t.id) h
  where t.archived_at is null
  on conflict (tenant_id, taken_on) do update set score = excluded.score, band = excluded.band, parts = excluded.parts;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- Every table above: RLS on, no policies, service role only.
alter table public.tenant_notes enable row level security;
alter table public.admin_tags enable row level security;
alter table public.tenant_tags enable row level security;
alter table public.tenant_follow_ups enable row level security;
alter table public.tenant_health_snapshots enable row level security;
revoke all on public.tenant_notes, public.admin_tags, public.tenant_tags, public.tenant_follow_ups, public.tenant_health_snapshots
  from public, anon, authenticated;
grant all on public.tenant_notes, public.admin_tags, public.tenant_tags, public.tenant_follow_ups, public.tenant_health_snapshots
  to service_role;
revoke all on function public.admin_refresh_health(date) from public, anon, authenticated;
grant execute on function public.admin_refresh_health(date) to service_role;

-- ---------------------------------------------------------------------------
-- Health checks (Data tab): differences between stored and recomputed figures
-- ---------------------------------------------------------------------------
create or replace function public.admin_reconcile_tenant(p_tenant uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    -- invoices whose amount_paid isn't the sum of their payments
    'payments', coalesce((
      select jsonb_agg(jsonb_build_object('id', q.id, 'number', q.invoice_number, 'stored', q.amount_paid, 'computed', coalesce(x.paid, 0)))
      from public.quotes q
      left join (select ip.quote_id, sum(ip.amount) as paid from public.invoice_payments ip where ip.tenant_id = p_tenant group by ip.quote_id) x on x.quote_id = q.id
      where q.tenant_id = p_tenant and q.amount_paid <> coalesce(x.paid, 0)), '[]'::jsonb),
    -- items whose reserved quantity isn't the sum of open quotation reservations
    'reservations', coalesce((
      select jsonb_agg(jsonb_build_object('id', i.id, 'sku', i.sku, 'name', i.name, 'stored', i.reserved_quantity, 'computed', coalesce(r.qty, 0)))
      from public.inventory_items i
      left join (select qi.item_id, sum(qi.reserved_qty) as qty from public.quote_items qi where qi.tenant_id = p_tenant group by qi.item_id) r on r.item_id = i.id
      where i.tenant_id = p_tenant and i.reserved_quantity <> coalesce(r.qty, 0)), '[]'::jsonb),
    'checkedAt', now()
  );
$$;
revoke all on function public.admin_reconcile_tenant(uuid) from public, anon, authenticated;
grant execute on function public.admin_reconcile_tenant(uuid) to service_role;
