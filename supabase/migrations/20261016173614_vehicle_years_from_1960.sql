-- Vehicles from 1960 onwards (was 1980). NHTSA vPIC only has models from 1981,
-- so older years are added by other means.
alter table public.vehicles drop constraint vehicles_year_check;
alter table public.vehicles add constraint vehicles_year_check check (year between 1960 and 2035);
