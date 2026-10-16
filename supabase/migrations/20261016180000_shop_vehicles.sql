-- Vehicles a shop adds itself (e.g. a 1975 model NHTSA doesn't list). tenant_id is null
-- for the shared catalog and set for a shop's own vehicles, which only that shop sees.

alter table public.vehicles
  add column tenant_id uuid references public.tenants (id) on delete cascade;

-- Same year/make/model may exist once in the catalog and once per shop.
alter table public.vehicles drop constraint uq_vehicle_ymm;
alter table public.vehicles
  add constraint uq_vehicle_ymm unique nulls not distinct (year, make, model, trim, tenant_id);
create index vehicles_tenant_idx on public.vehicles (tenant_id) where tenant_id is not null;

-- Catalog + own shop only.
drop policy "Authenticated users can read global vehicles" on public.vehicles;
create policy "Catalog and own shop vehicles" on public.vehicles
  for select to authenticated
  using (tenant_id is null or tenant_id = (select private.current_tenant_id()));

create policy "Shops add their own vehicles" on public.vehicles
  for insert to authenticated
  with check (tenant_id = (select private.current_tenant_id()));

-- A part can only be linked to a catalog vehicle or one of its own shop's.
create function private.check_fitment_vehicle()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.vehicles v
    where v.id = new.vehicle_id and (v.tenant_id is null or v.tenant_id = new.tenant_id)
  ) then
    raise exception 'One of the selected vehicles no longer exists.' using errcode = '23503';
  end if;
  return new;
end;
$$;
revoke all on function private.check_fitment_vehicle() from public;

create trigger item_vehicle_compatibility_check_vehicle
  before insert or update on public.item_vehicle_compatibility
  for each row execute function private.check_fitment_vehicle();

-- Adds a vehicle for the caller's shop, or returns the matching one the shop can already
-- see (catalog first). Makes are stored upper-case like the NHTSA rows.
create function public.add_vehicle(p_year integer, p_make text, p_model text)
returns table (id integer, year integer, make text, model text, "trim" text)
language plpgsql
security invoker
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_tenant_id uuid := private.current_tenant_id();
  v_make text := upper(regexp_replace(btrim(coalesce(p_make, '')), '\s+', ' ', 'g'));
  v_model text := regexp_replace(btrim(coalesce(p_model, '')), '\s+', ' ', 'g');
  v_id integer;
begin
  if v_tenant_id is null then
    raise exception 'Not authenticated.' using errcode = '42501';
  end if;
  if p_year is null or p_year < 1960 or p_year > extract(year from now())::integer + 1 then
    raise exception 'Choose a year from 1960 to %.', extract(year from now())::integer + 1 using errcode = '22023';
  end if;
  if char_length(v_make) not between 1 and 64 or char_length(v_model) not between 1 and 64 then
    raise exception 'Enter a make and model (up to 64 characters each).' using errcode = '22023';
  end if;

  select v.id into v_id
  from public.vehicles v
  where v.year = p_year and v.make = v_make and lower(v.model) = lower(v_model) and v."trim" is null
  order by v.tenant_id nulls first
  limit 1;

  if v_id is null then
    insert into public.vehicles (year, make, model, tenant_id)
    values (p_year, v_make, v_model, v_tenant_id)
    returning vehicles.id into v_id;
  end if;

  return query select v.id, v.year, v.make, v.model, v."trim" from public.vehicles v where v.id = v_id;
end;
$$;

revoke all on function public.add_vehicle(integer, text, text) from public, anon;
grant execute on function public.add_vehicle(integer, text, text) to authenticated;
grant insert (year, make, model, tenant_id) on public.vehicles to authenticated;
grant usage on sequence public.vehicles_id_seq to authenticated;
