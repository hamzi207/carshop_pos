-- =============================================================================
-- PROJECT_SPEC.md Phase 2 — Vehicle catalog support
-- =============================================================================

-- trim is NULL for every NHTSA-seeded row. With the default NULLS DISTINCT, the
-- (year, make, model, trim) constraint never matched those rows, so re-running
-- the seed would insert duplicates instead of hitting ON CONFLICT.
alter table public.vehicles drop constraint uq_vehicle_ymm;
alter table public.vehicles
  add constraint uq_vehicle_ymm unique nulls not distinct (year, make, model, trim);

-- -----------------------------------------------------------------------------
-- Cascading Year → Make → Model lookups for the dropdowns.
-- PostgREST has no DISTINCT and caps responses at max_rows, so these run as
-- RPCs. SECURITY INVOKER: the caller's RLS still applies (vehicles are readable
-- by any signed-in user).
-- -----------------------------------------------------------------------------
create or replace function public.vehicle_years()
returns table (year integer)
language sql
stable
security invoker
set search_path = ''
as $$
  select distinct v.year from public.vehicles v order by v.year desc;
$$;

create or replace function public.vehicle_makes(p_year integer)
returns table (make text)
language sql
stable
security invoker
set search_path = ''
as $$
  select distinct v.make from public.vehicles v where v.year = p_year order by v.make;
$$;

create or replace function public.vehicle_models(p_year integer, p_make text)
returns table (id integer, model text, "trim" text)
language sql
stable
security invoker
set search_path = ''
as $$
  select v.id, v.model, v."trim"
  from public.vehicles v
  where v.year = p_year and v.make = p_make
  order by v.model, v."trim" nulls first;
$$;

revoke execute on function public.vehicle_years() from public, anon;
revoke execute on function public.vehicle_makes(integer) from public, anon;
revoke execute on function public.vehicle_models(integer, text) from public, anon;
grant execute on function public.vehicle_years() to authenticated;
grant execute on function public.vehicle_makes(integer) to authenticated;
grant execute on function public.vehicle_models(integer, text) to authenticated;
