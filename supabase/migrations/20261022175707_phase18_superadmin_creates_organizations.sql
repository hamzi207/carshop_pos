-- Phase 18: the superadmin creates every organization; there is no self sign-up.
-- Until now any new auth user with shop_name metadata got a shop from the on-signup trigger, which a
-- public supabase.auth.signUp() call could set. The trigger goes; Create Organization (service role)
-- provisions the shop with public.admin_create_organization() after creating the owner's account.

drop trigger on_auth_user_created_register_shop on auth.users;
drop function public.handle_new_shop_registration();

create function public.admin_create_organization(p_user uuid, p_shop_name text, p_full_name text, p_industry uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_email text;
  v_shop_name text := nullif(trim(p_shop_name), '');
  v_base_slug text;
  v_tenant_id uuid;
begin
  select u.email into v_email from auth.users u where u.id = p_user;
  if v_email is null then
    raise exception 'That account doesn''t exist.' using errcode = '22023';
  end if;
  if v_shop_name is null then
    raise exception 'Enter the organization''s name.' using errcode = '22023';
  end if;
  if exists (select 1 from public.profiles p where p.id = p_user) or exists (select 1 from public.platform_admins a where a.id = p_user) then
    raise exception 'This account already belongs to an organization or is a superadmin.' using errcode = '22023';
  end if;
  if not exists (select 1 from public.industries i where i.id = p_industry) then
    raise exception 'That industry doesn''t exist.' using errcode = '22023';
  end if;

  v_base_slug := trim(both '-' from regexp_replace(lower(v_shop_name), '[^a-z0-9]+', '-', 'g'));
  if v_base_slug = '' then
    v_base_slug := 'shop';
  end if;

  insert into public.tenants (name, slug, email, industry_id)
  values (v_shop_name, v_base_slug || '-' || substr(replace(p_user::text, '-', ''), 1, 6), v_email, p_industry)
  returning id into v_tenant_id;

  insert into public.profiles (id, tenant_id, full_name, email, role)
  values (p_user, v_tenant_id, coalesce(nullif(trim(p_full_name), ''), split_part(v_email, '@', 1)), v_email, 'admin');

  return v_tenant_id;
end;
$$;

revoke all on function public.admin_create_organization(uuid, text, text, uuid) from public, anon, authenticated;
grant execute on function public.admin_create_organization(uuid, text, text, uuid) to service_role;

-- The sign-up page's helpers and switch.
drop function public.signup_open();
drop function public.signup_industries();
alter table public.platform_settings drop column signup_open;
