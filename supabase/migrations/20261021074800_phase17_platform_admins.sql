-- Phase 17: superadmins become their own accounts, separate from shops. A platform admin has no
-- shop profile (and a shop user is never a platform admin); they sign in at /admin/login, never at
-- the shop's /login. Replaces profiles.is_superadmin.

create table public.platform_admins (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text not null check (char_length(btrim(full_name)) between 2 and 120),
  email text not null,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users (id) on delete set null,
  -- Removed admins keep their row (their name stays on the audit log) and can't sign in.
  removed_at timestamptz,
  removed_by uuid references auth.users (id) on delete set null
);
create unique index platform_admins_email_key on public.platform_admins (lower(email));
-- Service role only.
alter table public.platform_admins enable row level security;
revoke all on public.platform_admins from anon, authenticated;

create or replace function private.is_platform_admin(p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.platform_admins a where a.id = p_user and a.removed_at is null);
$$;

-- An account is either a shop user or a platform admin, never both.
create or replace function private.platform_admin_not_shop_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_table_name = 'platform_admins' and exists (select 1 from public.profiles p where p.id = new.id) then
    raise exception 'This account belongs to a shop. Superadmins need their own account.' using errcode = '23505';
  end if;
  if tg_table_name = 'profiles' and exists (select 1 from public.platform_admins a where a.id = new.id) then
    raise exception 'This account is a superadmin account and can''t join a shop.' using errcode = '23505';
  end if;
  return new;
end;
$$;
create trigger platform_admins_not_shop_user before insert on public.platform_admins
  for each row execute function private.platform_admin_not_shop_user();
create trigger profiles_not_platform_admin before insert on public.profiles
  for each row execute function private.platform_admin_not_shop_user();

-- Add, remove or bring back a platform admin. The last active one can't be removed.
create or replace function public.admin_set_platform_admin(p_user uuid, p_active boolean, p_by uuid, p_full_name text default null, p_email text default null)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row public.platform_admins;
begin
  perform pg_advisory_xact_lock(hashtext('admin_set_platform_admin'));
  select * into v_row from public.platform_admins where id = p_user;
  if p_active then
    if v_row.id is null then
      insert into public.platform_admins (id, full_name, email, created_by) values (p_user, btrim(p_full_name), lower(btrim(p_email)), p_by);
      return true;
    end if;
    if v_row.removed_at is null then
      return false;
    end if;
    update public.platform_admins set removed_at = null, removed_by = null where id = p_user;
    return true;
  end if;
  if v_row.id is null or v_row.removed_at is not null then
    return false;
  end if;
  if (select count(*) from public.platform_admins where removed_at is null) <= 1 then
    raise exception 'The last superadmin can''t be removed.' using errcode = '22023';
  end if;
  update public.platform_admins set removed_at = now(), removed_by = p_by where id = p_user;
  return true;
end;
$$;
revoke all on function public.admin_set_platform_admin(uuid, boolean, uuid, text, text) from public, anon, authenticated;
grant execute on function public.admin_set_platform_admin(uuid, boolean, uuid, text, text) to service_role;
drop function public.admin_set_superadmin(uuid, boolean);

-- Login As: the session's admin must be an active platform admin.
-- The rest stop leaving superadmins out of a shop's user counts (shop profiles no longer include them).
do $$
declare
  v_def text;
  v_fn record;
begin
  for v_fn in
    select * from (values
      ('private.impersonation_session()', 'join public.profiles p on p.id = s.admin_id and p.is_superadmin', 'join public.platform_admins a on a.id = s.admin_id and a.removed_at is null'),
      ('private.profiles_check_user_limit()', 'if new.is_superadmin or new.deactivated_at is not null then', 'if new.deactivated_at is not null then'),
      ('private.profiles_check_user_limit()', ' and not p.is_superadmin and p.id <> new.id', ' and p.id <> new.id'),
      ('private.tenant_health(uuid)', 'where p.tenant_id = p_tenant and not p.is_superadmin', 'where p.tenant_id = p_tenant'),
      ('public.admin_near_limits(numeric)', ' and x.deactivated_at is null and not x.is_superadmin) as users', ' and x.deactivated_at is null) as users'),
      ('public.my_subscription()', ' and x.deactivated_at is null and not x.is_superadmin)', ' and x.deactivated_at is null)')
    ) as t (fn, old_text, new_text)
  loop
    v_def := pg_get_functiondef(v_fn.fn::regprocedure);
    if position(v_fn.old_text in v_def) = 0 then
      raise exception 'Expected text not found in %: %', v_fn.fn, v_fn.old_text;
    end if;
    execute replace(v_def, v_fn.old_text, v_fn.new_text);
  end loop;
end;
$$;

-- /admin/users: shop users only.
drop function public.admin_users(text, integer, integer);
create function public.admin_users(p_search text, p_limit integer, p_offset integer)
returns table (id uuid, full_name text, email text, role text, created_at timestamptz, last_sign_in_at timestamptz,
               deactivated_at timestamptz, tenant_id uuid, tenant_name text, tenant_status text, tenant_archived_at timestamptz, total bigint)
language sql
stable
security definer
set search_path = ''
as $$
  select p.id, p.full_name, p.email, p.role, p.created_at, u.last_sign_in_at,
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

alter table public.profiles drop column is_superadmin;

-- Documents and payments a superadmin makes during Login As record their account (which has no shop profile).
alter table public.quotes drop constraint quotes_created_by_fkey,
  add constraint quotes_created_by_fkey foreign key (created_by) references auth.users (id) on delete set null;
alter table public.invoice_payments drop constraint invoice_payments_created_by_fkey,
  add constraint invoice_payments_created_by_fkey foreign key (created_by) references auth.users (id) on delete set null;

-- The invitation a new superadmin gets.
alter table public.email_logs drop constraint email_logs_template_check;
alter table public.email_logs add constraint email_logs_template_check check (template = any (array[
  'welcome', 'password_reset', 'staff_invite', 'document_share', 'payment_receipt', 'subscription_invoice',
  'subscription_reminder', 'subscription_receipt', 'subscription_notice', 'superadmin_notice', 'superadmin_invite']));
