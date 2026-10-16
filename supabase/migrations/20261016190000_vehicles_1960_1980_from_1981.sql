-- NHTSA vPIC has no models before 1981; reuse each make's 1981 models for 1960–1980.
insert into public.vehicles (year, make, model)
select y.year, v.make, v.model
from generate_series(1960, 1980) as y(year)
cross join (select distinct make, model from public.vehicles where year = 1981 and tenant_id is null) v
on conflict do nothing;
