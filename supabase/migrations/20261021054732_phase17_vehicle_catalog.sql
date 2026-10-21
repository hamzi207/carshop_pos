-- Phase 17 (deliverable 5): the superadmin's vehicle catalog. Rows can be deactivated (hidden from
-- the year/make/model pickers and CSV matching; items and documents already linked keep them) and
-- duplicates merged into one row.

alter table public.vehicles add column deactivated_at timestamptz;

-- Pickers and matching skip deactivated rows.
create or replace function public.vehicle_years()
returns table (year integer)
language sql
stable
set search_path = ''
as $$
  select distinct v.year from public.vehicles v where v.deactivated_at is null order by v.year desc;
$$;

create or replace function public.vehicle_makes(p_year integer)
returns table (make text)
language sql
stable
set search_path = ''
as $$
  select distinct v.make from public.vehicles v where v.year = p_year and v.deactivated_at is null order by v.make;
$$;

create or replace function public.vehicle_models(p_year integer, p_make text)
returns table (id integer, model text, "trim" text)
language sql
stable
set search_path = ''
as $$
  select v.id, v.model, v."trim"
  from public.vehicles v
  where v.year = p_year and v.make = p_make and v.deactivated_at is null
  order by v.model, v."trim" nulls first;
$$;

create or replace function public.match_vehicles(p_specs jsonb)
returns table (spec_index integer, vehicle_id integer)
language sql
stable
set search_path = ''
as $$
  select (s.ord - 1)::integer, v.id
  from jsonb_array_elements(p_specs) with ordinality as s(spec, ord)
  join public.vehicles v
    on lower(v.make || ' ' || v.model) = lower(s.spec ->> 'label')
   and v.year between (s.spec ->> 'from')::integer and (s.spec ->> 'to')::integer
   and v.deactivated_at is null
  where jsonb_typeof(p_specs) = 'array' and jsonb_array_length(p_specs) <= 2000;
$$;

create or replace function public.add_vehicle(p_year integer, p_make text, p_model text)
returns table (id integer, year integer, make text, model text, "trim" text)
language plpgsql
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

  -- An active catalog row first, then the shop's own (a deactivated catalog row isn't reused).
  select v.id into v_id
  from public.vehicles v
  where v.year = p_year and v.make = v_make and lower(v.model) = lower(v_model) and v."trim" is null
    and (v.deactivated_at is null or v.tenant_id = v_tenant_id)
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

-- ---------------------------------------------------------------------------
-- Console (service role only)
-- ---------------------------------------------------------------------------
-- Search the catalog ("corolla 2015", "toyota"), with how often each row is used.
-- p_scope: all / catalog (active platform rows) / shops (added by shops) / inactive.
create or replace function public.admin_vehicles(
  p_query text,
  p_year integer default null,
  p_scope text default 'all',
  p_limit integer default 50,
  p_offset integer default 0
)
returns table (id integer, year integer, make text, model text, "trim" text, tenant_id uuid, tenant_name text,
               deactivated_at timestamptz, items bigint, documents bigint, total bigint)
language sql
stable
security definer
set search_path = ''
as $$
  with words as (
    select w from regexp_split_to_table(lower(btrim(coalesce(p_query, ''))), '\s+') w where w <> ''
  ), hits as (
    select v.*
    from public.vehicles v
    where (p_year is null or v.year = p_year)
      and case p_scope
            when 'catalog' then v.tenant_id is null and v.deactivated_at is null
            when 'shops' then v.tenant_id is not null
            when 'inactive' then v.deactivated_at is not null
            else true
          end
      and not exists (
        select 1 from words
        where not (lower(v.make || ' ' || v.model || ' ' || coalesce(v."trim", '')) like '%' || w || '%' or v.year::text = w)
      )
  )
  select h.id, h.year, h.make, h.model, h."trim", h.tenant_id, t.name, h.deactivated_at,
    (select count(*) from public.item_vehicle_compatibility c where c.vehicle_id = h.id),
    (select count(*) from public.quotes q where q.vehicle_id = h.id),
    count(*) over ()
  from hits h
  left join public.tenants t on t.id = h.tenant_id
  order by h.make, h.model, h.year desc, h."trim" nulls first, h.id
  limit greatest(least(p_limit, 200), 1) offset greatest(p_offset, 0);
$$;

-- Merges duplicates into p_keep: their item links and documents move to it, then they're deleted.
-- Returns how many rows were merged.
create or replace function public.admin_merge_vehicles(p_keep integer, p_merge integer[])
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_keep public.vehicles;
  v_ids integer[];
begin
  select * into v_keep from public.vehicles where id = p_keep;
  if v_keep.id is null then
    raise exception 'The vehicle to keep was not found.' using errcode = 'P0002';
  end if;
  select array_agg(id) into v_ids from public.vehicles where id = any (p_merge) and id <> p_keep;
  if v_ids is null then
    return 0;
  end if;
  -- A shop's own row can only take in rows of the same shop (otherwise keep a catalog row).
  if v_keep.tenant_id is not null
     and exists (select 1 from public.vehicles where id = any (v_ids) and tenant_id is distinct from v_keep.tenant_id) then
    raise exception 'Keep a catalog row when merging vehicles of different shops.' using errcode = '22023';
  end if;
  -- Item links move, except where the item is already linked to the kept row.
  update public.item_vehicle_compatibility c set vehicle_id = p_keep
  where c.vehicle_id = any (v_ids)
    and not exists (
      select 1 from public.item_vehicle_compatibility k
      where k.tenant_id = c.tenant_id and k.item_id = c.item_id and k.vehicle_id = p_keep
    );
  delete from public.item_vehicle_compatibility where vehicle_id = any (v_ids);
  update public.quotes set vehicle_id = p_keep where vehicle_id = any (v_ids);
  delete from public.vehicles where id = any (v_ids);
  return cardinality(v_ids);
end;
$$;

revoke all on function public.admin_vehicles(text, integer, text, integer, integer) from public, anon, authenticated;
grant execute on function public.admin_vehicles(text, integer, text, integer, integer) to service_role;
revoke all on function public.admin_merge_vehicles(integer, integer[]) from public, anon, authenticated;
grant execute on function public.admin_merge_vehicles(integer, integer[]) to service_role;
