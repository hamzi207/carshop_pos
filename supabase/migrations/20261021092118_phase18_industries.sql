-- Phase 18 (1/3): industries, organization ↔ industry, modules (docs/upgrade-plan.md Phase 18).

create table public.industries (
  id uuid primary key default gen_random_uuid(),
  name text not null check (name = btrim(name) and char_length(name) between 2 and 80),
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(slug) <= 60),
  description text check (char_length(description) <= 300),
  icon text not null default 'store' check (icon ~ '^[a-z0-9-]{1,40}$'),
  sort_order integer not null default 0,
  is_active boolean not null default true,
  default_modules text[] not null default '{}' check (cardinality(default_modules) <= 20),
  default_uoms text[] not null default '{pcs}' check (cardinality(default_uoms) <= 30),
  default_settings jsonb not null default '{}' check (jsonb_typeof(default_settings) = 'object'),
  onboarding_steps text[] not null default '{profile,logo,payment_details,products,opening_stock,customer,team,first_quotation,first_invoice}'
    check (cardinality(onboarding_steps) <= 20),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index industries_name_key on public.industries (lower(name));

insert into public.industries (name, slug, description, icon, sort_order, default_modules, default_uoms, default_settings) values
  ('General Retail & Departmental Stores', 'general-retail', 'Household goods, plastics, kitchen items, gifts and mixed merchandise.', 'store', 10, '{}', '{pcs,pack,box,dozen}', '{"prices_include_tax": true}'),
  ('Supermarket, Grocery & Kiryana', 'grocery', 'Atta, rice, daal, oil and ghee, spices, beverages, snacks, dairy, cleaning and personal care.', 'shopping-cart', 20, '{}', '{pcs,kg,g,l,ml,pack,carton,dozen}', '{"prices_include_tax": true}'),
  ('Wholesale & FMCG Distribution', 'wholesale-fmcg', 'Cartons and packs of branded consumer goods supplied to retailers.', 'truck', 30, '{}', '{pcs,pack,carton,box,dozen,kg,l}', '{"prices_include_tax": true}'),
  ('Apparel & Footwear', 'apparel-footwear', 'Men, women and kids clothing, shalwar kameez, unstitched suits, shoes and accessories.', 'shirt', 40, '{}', '{pcs,pair,suit,set}', '{"prices_include_tax": true}'),
  ('Textile, Fabric & Cloth Houses', 'textile-fabric', 'Lawn, cotton, khaddar, wash & wear, bedsheets and towels by meter, than or piece.', 'scissors', 50, '{}', '{m,yd,than,suit,pcs}', '{"prices_include_tax": true}'),
  ('Electronics, Mobile Phones & Accessories', 'electronics-mobile', 'Phones, chargers, cables, covers, home appliances and small electronics.', 'smartphone', 60, '{}', '{pcs,box,set}', '{"prices_include_tax": true}'),
  ('Computers & IT Equipment', 'computers-it', 'Laptops, parts, networking, printers, toner and CCTV.', 'laptop', 70, '{}', '{pcs,box,set,m}', '{"prices_include_tax": false}'),
  ('Pharmacy & Medical Supplies', 'pharmacy-medical', 'Medicines, surgical items, medical devices and OTC products.', 'pill', 80, '{}', '{pcs,strip,box,bottle,tablet}', '{"prices_include_tax": true}'),
  ('Cosmetics, Beauty & Personal Care', 'cosmetics-beauty', 'Skin care, makeup, fragrances and salon supplies.', 'sparkles', 90, '{}', '{pcs,box,set,bottle}', '{"prices_include_tax": true}'),
  ('Hardware, Building Materials & Sanitary', 'hardware-building-sanitary', 'Tools, fasteners, paint, cement, pipes, fittings, sanitary ware and tiles.', 'hammer', 100, '{}', '{pcs,bag,kg,ft,m,box,sqft}', '{"prices_include_tax": true}'),
  ('Electrical & Lighting', 'electrical-lighting', 'Cables by meter or coil, switches, breakers, lights, fans and solar accessories.', 'lightbulb', 110, '{}', '{pcs,m,coil,box}', '{"prices_include_tax": true}'),
  ('Automotive Accessories & Parts', 'automotive', 'Car accessories, parts, tint, wrap and PPF, audio, lighting and care products.', 'car', 120, '{vehicle_fitment}', '{pcs,set,pair,l,m}', '{"prices_include_tax": true}'),
  ('Books, Stationery & School Supplies', 'books-stationery', 'Books, copies, office stationery, school uniforms and bags.', 'book-open', 130, '{}', '{pcs,pack,dozen,ream,box}', '{"prices_include_tax": true}'),
  ('Toys, Gifts & Party Supplies', 'toys-gifts', 'Toys, gift items, decorations and party goods.', 'gift', 140, '{}', '{pcs,pack,set,dozen}', '{"prices_include_tax": true}');

alter table public.tenants
  add column industry_id uuid references public.industries (id) on delete restrict,
  add column modules text[] not null default '{}' check (cardinality(modules) <= 20),
  add column onboarding_dismissed_at timestamptz;

update public.tenants
set industry_id = (select id from public.industries where slug = 'automotive'),
    modules = '{vehicle_fitment}';

alter table public.tenants alter column industry_id set not null;
create index tenants_industry_idx on public.tenants (industry_id);

-- Org admins can hide (or show again) their setup checklist; industry and modules stay superadmin-only.
grant update (onboarding_dismissed_at) on public.tenants to authenticated;

create function private.current_industry_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select t.industry_id from public.tenants t where t.id = private.current_tenant_id();
$$;
revoke all on function private.current_industry_id() from public, anon;
grant execute on function private.current_industry_id() to authenticated, service_role;

alter table public.industries enable row level security;
revoke all on public.industries from anon, authenticated;
grant select on public.industries to authenticated;
create policy "Signed-in users read active industries and their own" on public.industries
  for select to authenticated
  using (is_active or id = (select private.current_industry_id()));

-- The sign-up page (anonymous) lists active industries.
create function public.signup_industries()
returns table (id uuid, name text, slug text, description text, icon text)
language sql
stable
security definer
set search_path = ''
as $$
  select i.id, i.name, i.slug, i.description, i.icon
  from public.industries i
  where i.is_active
  order by i.sort_order, i.name;
$$;
revoke all on function public.signup_industries() from public;
grant execute on function public.signup_industries() to anon, authenticated, service_role;

-- A module is on when the organization's switch is on and its plan allows it (Phase 17 plan limits).
create or replace function private.tenant_has_module(p_tenant uuid, p_module text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select p_module = any (t.modules) from public.tenants t where t.id = p_tenant), false)
     and coalesce((
       select p_module = any (coalesce(s.allowed_modules, p.allowed_modules)) or coalesce(s.allowed_modules, p.allowed_modules) is null
       from public.tenant_subscriptions s
       join public.subscription_plans p on p.id = s.plan_id
       where s.tenant_id = p_tenant), true);
$$;

-- The caller's organization's switched-on modules (session; follows Login As).
create function public.my_modules()
returns text[]
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(array_agg(m order by m), '{}')
  from public.tenants t, unnest(t.modules) m
  where t.id = private.current_tenant_id() and private.tenant_has_module(t.id, m);
$$;
revoke all on function public.my_modules() from public, anon;
grant execute on function public.my_modules() to authenticated, service_role;

-- New organizations start with their industry's modules and settings.
create function private.tenants_industry_defaults()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_industry public.industries;
begin
  select * into v_industry from public.industries where id = new.industry_id;
  if cardinality(new.modules) = 0 then
    new.modules := v_industry.default_modules;
  end if;
  if v_industry.default_settings ? 'prices_include_tax' then
    new.prices_include_tax := (v_industry.default_settings ->> 'prices_include_tax')::boolean;
  end if;
  return new;
end;
$$;
revoke all on function private.tenants_industry_defaults() from public, anon, authenticated;
create trigger tenants_industry_defaults before insert on public.tenants
  for each row execute function private.tenants_industry_defaults();
