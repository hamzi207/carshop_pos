-- Phase 15: inventory CSV import. Resolves "Vehicles" cells ("2018-2022 SUZUKI Alto") to vehicle ids in
-- one query. p_specs: [{ "label": "suzuki alto", "from": 2018, "to": 2022 }, ...]; returns the matching
-- vehicles per spec (0-based index). Invoker: the vehicles RLS policy decides which rows are visible
-- (the shared catalogue plus the caller's own shop vehicles).
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
  where jsonb_typeof(p_specs) = 'array' and jsonb_array_length(p_specs) <= 2000;
$$;
revoke all on function public.match_vehicles(jsonb) from public, anon;
grant execute on function public.match_vehicles(jsonb) to authenticated;
