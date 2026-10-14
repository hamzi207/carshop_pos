-- =============================================================================
-- PROJECT_SPEC.md §3.2 — Row Level Security ("Digital Lock")
-- =============================================================================
alter table public.tenants enable row level security;
alter table public.profiles enable row level security;
alter table public.vehicles enable row level security;
alter table public.inventory_items enable row level security;
alter table public.item_vehicle_compatibility enable row level security;
alter table public.customers enable row level security;
alter table public.quotes enable row level security;
alter table public.quote_items enable row level security;

-- -----------------------------------------------------------------------------
-- Data API exposure. New tables are no longer exposed automatically, so grant
-- explicitly. Only signed-in users get access; anon gets nothing. RLS still
-- decides which rows each signed-in user sees.
-- -----------------------------------------------------------------------------
revoke all on public.tenants, public.profiles, public.vehicles, public.inventory_items,
  public.item_vehicle_compatibility, public.customers, public.quotes, public.quote_items
  from anon, authenticated;

grant select on public.vehicles to authenticated;
grant select on public.tenants to authenticated;
-- id/slug/created_at are not client-editable.
grant update (name, logo_url, address, phone, email, currency, tax_rate, quote_footer_notes, updated_at)
  on public.tenants to authenticated;
grant select on public.profiles to authenticated;
-- Users may edit their display name only: never their own role or tenant_id
-- (that would let a staff member promote themselves or hop into another shop).
grant update (full_name, updated_at) on public.profiles to authenticated;
grant select, insert, update, delete on public.inventory_items to authenticated;
grant select, insert, delete on public.item_vehicle_compatibility to authenticated;
grant select, insert, update, delete on public.customers to authenticated;
grant select, insert, update on public.quotes to authenticated;
grant select, insert, update, delete on public.quote_items to authenticated;
-- Server-side admin tooling (e.g. the Phase 2 vehicle seed script) uses service_role,
-- which bypasses RLS but still needs table privileges.
grant all on public.tenants, public.profiles, public.vehicles, public.inventory_items,
  public.item_vehicle_compatibility, public.customers, public.quotes, public.quote_items
  to service_role;
grant usage, select on sequence public.vehicles_id_seq to service_role;

revoke execute on function public.current_tenant_id() from public, anon;
grant execute on function public.current_tenant_id() to authenticated;

-- -----------------------------------------------------------------------------
-- VEHICLES: global read access for authenticated users
-- -----------------------------------------------------------------------------
create policy "Authenticated users can read global vehicles"
on public.vehicles for select
to authenticated
using (true);

-- -----------------------------------------------------------------------------
-- TENANTS: users can view their own shop; only admins can update it
-- -----------------------------------------------------------------------------
create policy "Users can view their own tenant"
on public.tenants for select
to authenticated
using (id = public.current_tenant_id());

create policy "Admins can update their own tenant"
on public.tenants for update
to authenticated
using (
  id = public.current_tenant_id()
  and exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
)
with check (id = public.current_tenant_id());

-- -----------------------------------------------------------------------------
-- PROFILES: users view profiles in their tenant, update only their own
-- -----------------------------------------------------------------------------
create policy "Users view profiles within their tenant"
on public.profiles for select
to authenticated
using (tenant_id = public.current_tenant_id());

create policy "Users can update their own profile"
on public.profiles for update
to authenticated
using (id = auth.uid())
with check (id = auth.uid());

-- -----------------------------------------------------------------------------
-- INVENTORY ITEMS
-- -----------------------------------------------------------------------------
create policy "Tenant isolation for inventory select"
on public.inventory_items for select to authenticated
using (tenant_id = public.current_tenant_id());

create policy "Tenant isolation for inventory insert"
on public.inventory_items for insert to authenticated
with check (tenant_id = public.current_tenant_id());

create policy "Tenant isolation for inventory update"
on public.inventory_items for update to authenticated
using (tenant_id = public.current_tenant_id())
with check (tenant_id = public.current_tenant_id());

create policy "Tenant isolation for inventory delete"
on public.inventory_items for delete to authenticated
using (tenant_id = public.current_tenant_id());

-- -----------------------------------------------------------------------------
-- ITEM VEHICLE COMPATIBILITY
-- -----------------------------------------------------------------------------
create policy "Tenant isolation for compatibility select"
on public.item_vehicle_compatibility for select to authenticated
using (tenant_id = public.current_tenant_id());

create policy "Tenant isolation for compatibility insert"
on public.item_vehicle_compatibility for insert to authenticated
with check (tenant_id = public.current_tenant_id());

create policy "Tenant isolation for compatibility delete"
on public.item_vehicle_compatibility for delete to authenticated
using (tenant_id = public.current_tenant_id());

-- -----------------------------------------------------------------------------
-- CUSTOMERS
-- -----------------------------------------------------------------------------
create policy "Tenant isolation for customers select"
on public.customers for select to authenticated
using (tenant_id = public.current_tenant_id());

create policy "Tenant isolation for customers insert"
on public.customers for insert to authenticated
with check (tenant_id = public.current_tenant_id());

create policy "Tenant isolation for customers update"
on public.customers for update to authenticated
using (tenant_id = public.current_tenant_id())
with check (tenant_id = public.current_tenant_id());

create policy "Tenant isolation for customers delete"
on public.customers for delete to authenticated
using (tenant_id = public.current_tenant_id());

-- -----------------------------------------------------------------------------
-- QUOTES & QUOTE ITEMS
-- -----------------------------------------------------------------------------
create policy "Tenant isolation for quotes select"
on public.quotes for select to authenticated
using (tenant_id = public.current_tenant_id());

create policy "Tenant isolation for quotes insert"
on public.quotes for insert to authenticated
with check (tenant_id = public.current_tenant_id());

create policy "Tenant isolation for quotes update"
on public.quotes for update to authenticated
using (tenant_id = public.current_tenant_id())
with check (tenant_id = public.current_tenant_id());

create policy "Tenant isolation for quote_items select"
on public.quote_items for select to authenticated
using (tenant_id = public.current_tenant_id());

create policy "Tenant isolation for quote_items insert"
on public.quote_items for insert to authenticated
with check (tenant_id = public.current_tenant_id());

create policy "Tenant isolation for quote_items update"
on public.quote_items for update to authenticated
using (tenant_id = public.current_tenant_id())
with check (tenant_id = public.current_tenant_id());

create policy "Tenant isolation for quote_items delete"
on public.quote_items for delete to authenticated
using (tenant_id = public.current_tenant_id());

-- =============================================================================
-- STORAGE: public `shop-assets` bucket for shop logos.
-- Files live under "<tenant_id>/...", and only members of that tenant can
-- write there. Reads are public (logos appear on shared quote PDFs).
-- Upsert needs INSERT + SELECT + UPDATE, so all three are granted.
-- =============================================================================
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('shop-assets', 'shop-assets', true, 2097152, array['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml'])
on conflict (id) do update set public = excluded.public;

create policy "Tenant members read their shop assets"
on storage.objects for select to authenticated
using (bucket_id = 'shop-assets' and (storage.foldername(name))[1] = public.current_tenant_id()::text);

create policy "Tenant members upload shop assets"
on storage.objects for insert to authenticated
with check (bucket_id = 'shop-assets' and (storage.foldername(name))[1] = public.current_tenant_id()::text);

create policy "Tenant members update shop assets"
on storage.objects for update to authenticated
using (bucket_id = 'shop-assets' and (storage.foldername(name))[1] = public.current_tenant_id()::text)
with check (bucket_id = 'shop-assets' and (storage.foldername(name))[1] = public.current_tenant_id()::text);

create policy "Tenant members delete shop assets"
on storage.objects for delete to authenticated
using (bucket_id = 'shop-assets' and (storage.foldername(name))[1] = public.current_tenant_id()::text);
