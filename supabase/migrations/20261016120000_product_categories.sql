-- Product categories (docs/categories.md). Replaces the six fixed inventory_items.category values with
-- a per-shop category tree: main categories → subcategories → deeper levels (at most 4 levels, e.g.
-- Exterior › Wrapping › Wrapping Tools › Heat Gun). Every shop starts with the default list; admins can add,
-- rename and delete categories later (Settings → Product categories). An item can sit on any level, and
-- filtering by a category includes everything below it.

-- ---- Table ---------------------------------------------------------------------------
create table public.categories (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null default public.current_tenant_id() references public.tenants (id) on delete cascade,
  parent_id uuid,
  name text not null constraint categories_name_check check (name = btrim(name) and char_length(name) between 1 and 60),
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  constraint categories_tenant_id_id_key unique (tenant_id, id),
  -- Same-shop parent only; a category with subcategories can't be deleted.
  constraint categories_parent_fkey foreign key (tenant_id, parent_id)
    references public.categories (tenant_id, id) on delete restrict
);

-- One name per level (case-insensitive); the same name may appear under different parents
-- (e.g. Fog Lights under both Electronics and Lighting).
create unique index categories_unique_name on public.categories (tenant_id, parent_id, lower(name)) nulls not distinct;
create index categories_parent_idx on public.categories (tenant_id, parent_id, sort_order);

-- At most 4 levels. parent_id can't be changed after insert (column grants), so no cycles.
create function private.categories_check_depth()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_depth integer;
begin
  if new.parent_id is null then
    return new;
  end if;
  with recursive up as (
    select c.id, c.parent_id, 1 as depth from public.categories c
    where c.id = new.parent_id and c.tenant_id = new.tenant_id
    union all
    select c.id, c.parent_id, up.depth + 1 from public.categories c join up on c.id = up.parent_id
  )
  select max(depth) into v_depth from up;
  if v_depth >= 4 then
    raise exception 'Categories can be at most 4 levels deep.' using errcode = '22023';
  end if;
  return new;
end;
$$;

create trigger categories_check_depth
  before insert on public.categories
  for each row execute function private.categories_check_depth();

-- ---- Access ---------------------------------------------------------------------------
alter table public.categories enable row level security;

create policy "Tenant isolation for categories select" on public.categories
  for select to authenticated
  using (tenant_id = private.current_tenant_id());

create policy "Admins manage categories insert" on public.categories
  for insert to authenticated
  with check (tenant_id = private.current_tenant_id()
    and exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.role = 'admin'));

create policy "Admins manage categories update" on public.categories
  for update to authenticated
  using (tenant_id = private.current_tenant_id()
    and exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.role = 'admin'))
  with check (tenant_id = private.current_tenant_id());

create policy "Admins manage categories delete" on public.categories
  for delete to authenticated
  using (tenant_id = private.current_tenant_id()
    and exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.role = 'admin'));

revoke all on public.categories from anon, authenticated;
grant select, delete on public.categories to authenticated;
grant insert (parent_id, name, sort_order) on public.categories to authenticated;
grant update (name, sort_order) on public.categories to authenticated;

-- ---- Default list (docs/categories.md) ---------------------------------------------------
-- p_tree: a JSON array; each entry is a name, or {"name": ..., "children": [...]}.
create function private.insert_category_tree(p_tenant_id uuid, p_parent_id uuid, p_tree jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_node jsonb;
  v_pos bigint;
  v_id uuid;
begin
  for v_node, v_pos in select value, ordinality from jsonb_array_elements(p_tree) with ordinality loop
    insert into public.categories (tenant_id, parent_id, name, sort_order)
    values (p_tenant_id, p_parent_id,
            case when jsonb_typeof(v_node) = 'string' then v_node #>> '{}' else v_node ->> 'name' end,
            v_pos * 10)
    returning id into v_id;
    if jsonb_typeof(v_node) = 'object' and v_node ? 'children' then
      perform private.insert_category_tree(p_tenant_id, v_id, v_node -> 'children');
    end if;
  end loop;
end;
$$;

create function private.seed_default_categories(p_tenant_id uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  select private.insert_category_tree(p_tenant_id, null, $json$[
    {"name": "Interior", "children": ["Floor Mats", "Seat Covers", "Steering Wheel Covers", "Gear Shift Covers",
      "Dashboard Covers", "Sun Shades", "Curtains", "Armrests", "Cup Holders", "Tissue Boxes", "Organizers",
      "Car Perfumes", "Air Fresheners"]},
    {"name": "Exterior", "children": ["Bumper Guards", "Mud Flaps", "Spoiler Extensions", "Lip Spoilers", "Side Skirts",
      "Window Visors", "License Plate Frames", "Door Edge Guards", "Body Kits", "Chrome Kits", "Decals", "Covers",
      {"name": "Wrapping", "children": ["Vinyl Wraps", "Tinting Film", "PPF",
        {"name": "Wrapping Tools", "children": ["Heat Gun", "Squeegees (Footaa)", "Knives", "Gloves", "Cutting Mat",
          "Tape", "Tweezers", "Wrap Cleaner"]}]}]},
    {"name": "Performance", "children": ["Filters", "Turbochargers", "Exhaust Systems", "Suspension Systems",
      "Brake Systems", "Drivetrain", "Engine", "Transmission", "Differential", "Axles", "Universal Joints",
      "CV Joints", "Driveshafts", "Propshafts", "Transfer Cases"]},
    {"name": "Electrical", "children": ["Wiring", "Battery", "Fuses & Relays", "Switches", "Sensors"]},
    {"name": "Cleaning & Detailing", "children": ["Shampoo", "Polish", "Wax", "Wipes", "Interior Cleaners",
      "Exterior Cleaners", "Glass Cleaners", "Wheel Cleaners", "Tire Cleaners", "Microfiber Cloths", "Sponges",
      "Brushes", "Applicators", "Wash Mitts", "Drying Towels", "Vacuum Cleaners", "Steam Cleaners"]},
    {"name": "Audio", "children": ["Sound System", "Speakers", "Subwoofers", "Amplifiers", "Wires", "Connectors",
      "Adapters", "Installation Kits", "Video Players", "Navigation Systems"]},
    {"name": "Electronics", "children": ["Parking Sensors", "Dash Cameras", "Rear View Mirrors", "Air Horns",
      "Fog Lights", "Driving Lights", "Trumpets", "Horns", "Antenna"]},
    {"name": "Security", "children": ["Alarms", "Immobilizers", "GPS Trackers", "Steering Wheel Locks", "Pedal Locks"]},
    {"name": "Lighting", "children": ["Headlights", "Taillights", "Bulbs", "Fog Lights", "Driving Lights",
      "Multicolor LEDs", "LEDs", "SMDs", "HIDs", "Neon Lights", "Underglow Lights", "RGB Lights", "Ambiance Lights"]},
    {"name": "Wheels & Tires", "children": ["Rims", "Tires", "Tire Pressure Monitoring System", "Tire Shine",
      "Tire Inflator"]},
    {"name": "Tools & Equipment", "children": ["Handheld Vipers", "Cutter Blades", "Cutters", "Tool Kits", "Zip Ties",
      "Paints", "Spray Paints"]},
    {"name": "Oils & Fluids", "children": ["Engine Oil", "Transmission Fluid", "Brake Fluid", "Coolant",
      "Power Steering Fluid", "Hydraulic Fluid", "Grease", "Additives"]},
    {"name": "Storage", "children": ["Storage Bags", "Organizer Bags"]},
    {"name": "Others", "children": ["Key Covers", "Key Shells", "Charger", "USB Cables", "Phone Mounts",
      "Phone Holders", "Ash Tray", "Paper Towels", "Tissue Papers"]}
  ]$json$::jsonb);
$$;

revoke all on function private.insert_category_tree(uuid, uuid, jsonb) from public;
revoke all on function private.seed_default_categories(uuid) from public;

-- New shops get the default list.
create function private.seed_tenant_categories()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.seed_default_categories(new.id);
  return new;
end;
$$;
revoke all on function private.seed_tenant_categories() from public;

create trigger tenants_seed_categories
  after insert on public.tenants
  for each row execute function private.seed_tenant_categories();

-- Existing shops.
select private.seed_default_categories(id) from public.tenants;

-- ---- Items: category text → category_id ---------------------------------------------------
alter table public.inventory_items add column category_id uuid;

-- Old fixed category → its place in the new tree.
with recursive tree as (
  select id, tenant_id, array[name] as path from public.categories where parent_id is null
  union all
  select c.id, c.tenant_id, tree.path || c.name from public.categories c join tree on c.parent_id = tree.id
),
old_map(category, path) as (values
  ('Window Film', array['Exterior', 'Wrapping', 'Tinting Film']),
  ('Vinyl Wrap', array['Exterior', 'Wrapping', 'Vinyl Wraps']),
  ('PPF', array['Exterior', 'Wrapping', 'PPF']),
  ('Car Audio', array['Audio']),
  ('Accessories', array['Others']),
  ('Hardware / Chemicals', array['Cleaning & Detailing'])
)
update public.inventory_items i
set category_id = tree.id
from old_map m, tree
where m.category = i.category and tree.tenant_id = i.tenant_id and tree.path = m.path;

alter table public.inventory_items
  alter column category_id set not null,
  add constraint inventory_items_category_fkey foreign key (tenant_id, category_id)
    references public.categories (tenant_id, id) on delete restrict,
  drop column category;

create index inventory_items_category_idx on public.inventory_items (category_id);

grant insert (category_id), update (category_id) on public.inventory_items to authenticated;

-- ---- save_inventory_item: p_category text → p_category_id uuid ------------------------------
drop function public.save_inventory_item(text, text, text, numeric, numeric, integer, integer, boolean, uuid, text, integer[], boolean, text);

create function public.save_inventory_item(
  p_sku text,
  p_name text,
  p_category_id uuid,
  p_cost_price numeric,
  p_selling_price numeric,
  p_quantity_on_hand integer,
  p_low_stock_threshold integer,
  p_is_universal boolean,
  p_item_id uuid default null,
  p_description text default null,
  p_vehicle_ids integer[] default '{}',
  p_price_includes_tax boolean default true,
  p_vendor_name text default null
)
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  v_tenant_id uuid := public.current_tenant_id();
  v_item_id uuid;
begin
  if v_tenant_id is null then
    raise exception 'Not authenticated.' using errcode = '42501';
  end if;

  if not p_is_universal and coalesce(cardinality(p_vehicle_ids), 0) = 0 then
    raise exception 'Vehicle-specific items need at least one vehicle.' using errcode = '22023';
  end if;

  if p_item_id is null then
    insert into public.inventory_items (
      tenant_id, sku, name, description, category_id, cost_price, selling_price,
      quantity_on_hand, low_stock_threshold, is_universal, price_includes_tax, vendor_name
    )
    values (
      v_tenant_id, p_sku, p_name, p_description, p_category_id, p_cost_price, p_selling_price,
      p_quantity_on_hand, p_low_stock_threshold, p_is_universal, p_price_includes_tax,
      nullif(btrim(p_vendor_name), '')
    )
    returning id into v_item_id;
  else
    update public.inventory_items
    set sku = p_sku,
        name = p_name,
        description = p_description,
        category_id = p_category_id,
        cost_price = p_cost_price,
        selling_price = p_selling_price,
        quantity_on_hand = p_quantity_on_hand,
        low_stock_threshold = p_low_stock_threshold,
        is_universal = p_is_universal,
        price_includes_tax = p_price_includes_tax,
        vendor_name = nullif(btrim(p_vendor_name), ''),
        updated_at = now()
    where id = p_item_id and tenant_id = v_tenant_id
    returning id into v_item_id;

    if v_item_id is null then
      raise exception 'Inventory item not found.' using errcode = 'P0002';
    end if;

    delete from public.item_vehicle_compatibility
    where item_id = v_item_id and tenant_id = v_tenant_id;
  end if;

  if not p_is_universal then
    insert into public.item_vehicle_compatibility (tenant_id, item_id, vehicle_id)
    select distinct v_tenant_id, v_item_id, vehicle_id
    from unnest(p_vehicle_ids) as vehicle_id;
  end if;

  return v_item_id;
end;
$$;

revoke all on function public.save_inventory_item(text, text, uuid, numeric, numeric, integer, integer, boolean, uuid, text, integer[], boolean, text) from public, anon;
grant execute on function public.save_inventory_item(text, text, uuid, numeric, numeric, integer, integer, boolean, uuid, text, integer[], boolean, text) to authenticated;

-- ---- Search also matches the item's category and the categories above it ----------------------
create or replace function public.search_inventory_items(p_query text)
returns setof public.inventory_items
language sql
stable
set search_path = ''
as $$
  with recursive tokens as (
    select distinct token
    from unnest(
      regexp_split_to_array(
        regexp_replace(lower(coalesce(p_query, '')), '[^[:alnum:][:space:]]', '', 'g'),
        '\s+'
      )
    ) as token
    where token <> ''
  ),
  cat_path as (
    select c.id, c.id as leaf, c.parent_id, c.name from public.categories c
    union all
    select p.id, cp.leaf, p.parent_id, p.name from public.categories p join cat_path cp on p.id = cp.parent_id
  ),
  cat_text as (
    select leaf, string_agg(name, ' ') as names from cat_path group by leaf
  )
  select i.*
  from public.inventory_items i
  left join cat_text ct on ct.leaf = i.category_id
  where exists (
    select 1
    from (
      select null::integer as vehicle_id
      union all
      select c.vehicle_id
      from public.item_vehicle_compatibility c
      where c.item_id = i.id
    ) fit
    left join public.vehicles v on v.id = fit.vehicle_id
    where not exists (
      select 1
      from tokens t
      where strpos(
        regexp_replace(
          lower(concat_ws(' ', i.sku, i.name, ct.names, v.make, v.model, v."trim", v.year::text)),
          '[^[:alnum:][:space:]]', '', 'g'
        ),
        t.token
      ) = 0
    )
  );
$$;
