-- =============================================================================
-- PROJECT_SPEC.md §3.1 — Full schema
-- =============================================================================
create extension if not exists "uuid-ossp" with schema extensions;

-- -----------------------------------------------------------------------------
-- TENANTS (each auto shop is a tenant)
-- -----------------------------------------------------------------------------
create table public.tenants (
  id uuid primary key default extensions.uuid_generate_v4(),
  name text not null,
  slug text unique not null,
  logo_url text,
  address text,
  phone text,
  email text,
  currency text not null default '$',
  tax_rate numeric(5,2) not null default 0.00,
  quote_footer_notes text default 'All quotes are valid for 30 days. 50% deposit required on custom orders.',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
-- PROFILES (linked to Supabase Auth)
-- -----------------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  full_name text not null,
  email text not null,
  role text not null check (role in ('admin', 'staff')) default 'staff',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_profiles_tenant_id on public.profiles(tenant_id);

-- Helper used by every RLS policy. search_path pinned because it is SECURITY DEFINER.
create or replace function public.current_tenant_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select tenant_id from public.profiles where id = auth.uid();
$$;

-- -----------------------------------------------------------------------------
-- VEHICLES (global reference data — not tenant-specific)
-- -----------------------------------------------------------------------------
create table public.vehicles (
  id serial primary key,
  year integer not null check (year between 1980 and 2035),
  make text not null,
  model text not null,
  trim text,
  created_at timestamptz not null default now(),
  constraint uq_vehicle_ymm unique (year, make, model, trim)
);

create index idx_vehicles_lookup on public.vehicles(year, make, model);

-- -----------------------------------------------------------------------------
-- INVENTORY ITEMS
-- -----------------------------------------------------------------------------
create table public.inventory_items (
  id uuid primary key default extensions.uuid_generate_v4(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  sku text not null,
  name text not null,
  description text,
  category text not null check (category in ('Window Film', 'Vinyl Wrap', 'PPF', 'Car Audio', 'Accessories', 'Hardware / Chemicals')),
  cost_price numeric(10,2) not null check (cost_price >= 0),
  selling_price numeric(10,2) not null check (selling_price >= 0),
  quantity_on_hand integer not null default 0 check (quantity_on_hand >= 0),
  low_stock_threshold integer not null default 5,
  is_universal boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint uq_tenant_sku unique (tenant_id, sku)
);

create index idx_inventory_tenant on public.inventory_items(tenant_id);
create index idx_inventory_universal on public.inventory_items(tenant_id, is_universal);

-- -----------------------------------------------------------------------------
-- ITEM ↔ VEHICLE COMPATIBILITY
-- -----------------------------------------------------------------------------
create table public.item_vehicle_compatibility (
  id uuid primary key default extensions.uuid_generate_v4(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  item_id uuid not null references public.inventory_items(id) on delete cascade,
  vehicle_id integer not null references public.vehicles(id) on delete cascade,
  notes text,
  created_at timestamptz not null default now(),
  constraint uq_item_vehicle unique (tenant_id, item_id, vehicle_id)
);

create index idx_compat_lookup on public.item_vehicle_compatibility(tenant_id, vehicle_id, item_id);

-- -----------------------------------------------------------------------------
-- CUSTOMERS
-- -----------------------------------------------------------------------------
create table public.customers (
  id uuid primary key default extensions.uuid_generate_v4(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  name text not null,
  customer_type text not null check (customer_type in ('Dealership', 'Fleet Account', 'Retail Customer')) default 'Retail Customer',
  contact_person text,
  phone text,
  whatsapp_number text not null,
  email text,
  billing_address text,
  tax_id text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_customers_tenant on public.customers(tenant_id);
create index idx_customers_whatsapp on public.customers(tenant_id, whatsapp_number);

-- -----------------------------------------------------------------------------
-- QUOTES & INVOICES
-- -----------------------------------------------------------------------------
create table public.quotes (
  id uuid primary key default extensions.uuid_generate_v4(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  quote_number text not null,
  customer_id uuid not null references public.customers(id) on delete restrict,
  vehicle_id integer references public.vehicles(id) on delete set null,
  custom_vehicle_notes text,
  status text not null check (status in ('draft', 'sent', 'accepted', 'invoiced', 'paid', 'cancelled')) default 'draft',
  subtotal numeric(10,2) not null default 0.00,
  tax_rate numeric(5,2) not null default 0.00,
  tax_amount numeric(10,2) not null default 0.00,
  discount_amount numeric(10,2) not null default 0.00,
  total_amount numeric(10,2) not null default 0.00,
  payment_method text check (payment_method in ('Cash', 'Card Terminal', 'Bank Transfer', 'Check')),
  payment_notes text,
  paid_at timestamptz,
  inventory_deducted boolean not null default false,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint uq_tenant_quote_number unique (tenant_id, quote_number)
);

create index idx_quotes_tenant_status on public.quotes(tenant_id, status);
create index idx_quotes_customer on public.quotes(customer_id);

-- -----------------------------------------------------------------------------
-- QUOTE LINE ITEMS
-- -----------------------------------------------------------------------------
create table public.quote_items (
  id uuid primary key default extensions.uuid_generate_v4(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  quote_id uuid not null references public.quotes(id) on delete cascade,
  item_id uuid references public.inventory_items(id) on delete set null,
  description text not null,
  is_labor boolean not null default false,
  quantity numeric(10,2) not null default 1.00 check (quantity > 0),
  unit_cost numeric(10,2) not null default 0.00,
  unit_price numeric(10,2) not null default 0.00,
  total_price numeric(10,2) not null default 0.00,
  created_at timestamptz not null default now()
);

create index idx_quote_items_quote on public.quote_items(quote_id);

-- =============================================================================
-- SHOP REGISTRATION: create tenant + admin profile atomically on sign-up.
-- Runs in the same transaction as the auth.users insert, so a failure here
-- rolls back the whole sign-up (no orphaned users or tenants).
-- shop_name / full_name come from sign-up metadata; they are only used as
-- display data here, never for authorization.
-- Sign-ups without shop_name (e.g. future staff invites) are left alone.
-- =============================================================================
create or replace function public.handle_new_shop_registration()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_shop_name text := nullif(trim(new.raw_user_meta_data ->> 'shop_name'), '');
  v_full_name text := coalesce(nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''), split_part(new.email, '@', 1));
  v_base_slug text;
  v_tenant_id uuid;
begin
  if v_shop_name is null then
    return new;
  end if;

  v_base_slug := trim(both '-' from regexp_replace(lower(v_shop_name), '[^a-z0-9]+', '-', 'g'));
  if v_base_slug = '' then
    v_base_slug := 'shop';
  end if;

  insert into public.tenants (name, slug, email)
  values (v_shop_name, v_base_slug || '-' || substr(replace(new.id::text, '-', ''), 1, 6), new.email)
  returning id into v_tenant_id;

  insert into public.profiles (id, tenant_id, full_name, email, role)
  values (new.id, v_tenant_id, v_full_name, new.email, 'admin');

  return new;
end;
$$;

create trigger on_auth_user_created_register_shop
  after insert on auth.users
  for each row execute function public.handle_new_shop_registration();

-- Trigger-only function: nobody should call it through the API.
revoke execute on function public.handle_new_shop_registration() from public, anon, authenticated;
