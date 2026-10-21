-- Phase 17: the reason a suspended organization's users see, and granting / revoking superadmin.

-- Sign-in: why the caller's organization is suspended (set by the superadmin), else null.
create or replace function public.my_status_reason()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select t.status_reason
  from public.profiles p
  join public.tenants t on t.id = p.tenant_id
  where p.id = auth.uid() and t.status = 'suspended';
$$;
revoke all on function public.my_status_reason() from public, anon;
grant execute on function public.my_status_reason() to authenticated;

-- Platform team: grant or revoke superadmin. Refuses to remove the last one (locked so two
-- revokes at once can't both pass). Returns false when nothing changed.
create or replace function public.admin_set_superadmin(p_user uuid, p_grant boolean)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_current boolean;
begin
  perform pg_advisory_xact_lock(hashtext('admin_set_superadmin'));
  select is_superadmin into v_current from public.profiles where id = p_user;
  if v_current is null then
    raise exception 'That user wasn''t found.' using errcode = 'P0002';
  end if;
  if v_current = p_grant then
    return false;
  end if;
  if not p_grant and (select count(*) from public.profiles where is_superadmin) <= 1 then
    raise exception 'The last superadmin can''t be removed.' using errcode = '22023';
  end if;
  update public.profiles set is_superadmin = p_grant, updated_at = now() where id = p_user;
  return true;
end;
$$;
revoke all on function public.admin_set_superadmin(uuid, boolean) from public, anon, authenticated;
grant execute on function public.admin_set_superadmin(uuid, boolean) to service_role;
