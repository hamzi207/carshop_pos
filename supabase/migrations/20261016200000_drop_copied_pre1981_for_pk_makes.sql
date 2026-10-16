-- The 1960–1980 rows copied from 1981 are replaced, for makes covered by
-- scripts/data/vehicles-pk.json, with real production years. Unlinked rows only.
-- Then run: npm run seed:vehicles:pk
delete from public.vehicles v
where v.year < 1981 and v.tenant_id is null
  and v.make in ('TOYOTA', 'HONDA', 'NISSAN', 'HYUNDAI', 'KIA')
  and not exists (select 1 from public.item_vehicle_compatibility c where c.vehicle_id = v.id);
