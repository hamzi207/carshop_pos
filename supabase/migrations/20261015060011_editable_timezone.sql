-- Shop timezone becomes admin-editable. Only real IANA names (as Postgres knows
-- them) are accepted, so date formatting can never receive a bad zone.
create or replace function public.is_valid_timezone(p_tz text)
returns boolean
language sql
stable
set search_path = ''
as $$
  select exists (select 1 from pg_catalog.pg_timezone_names where name = p_tz);
$$;

alter table public.tenants
  add constraint tenants_timezone_check check (public.is_valid_timezone(timezone));

-- Admin-only via the existing "Admins can update their own tenant" policy.
grant update (timezone) on public.tenants to authenticated;
