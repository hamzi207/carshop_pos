-- Phase 18 (2/4): superadmin-managed category catalogs (docs/upgrade-plan.md Phase 18).
-- Categories become platform data: one catalog per industry (industry_id set, tenant_id null) plus
-- organization-specific categories the superadmin adds (tenant_id set). Organizations read their industry's
-- catalog minus what the superadmin hid for them, plus their own; only the service role writes.
-- Also: category colour + image (RF-18.2), category requests, and the existing shops moved onto the
-- global Automotive catalog with every item keeping its exact category path.

-- ---- Old per-shop structure out of the way ------------------------------------------------------
drop trigger tenants_seed_categories on public.tenants;
drop function private.seed_tenant_categories();
drop function private.seed_default_categories(uuid);
drop function private.insert_category_tree(uuid, uuid, jsonb);

drop policy "Admins manage categories insert" on public.categories;
drop policy "Admins manage categories update" on public.categories;
drop policy "Admins manage categories delete" on public.categories;
drop policy "Tenant isolation for categories select" on public.categories;
revoke insert, update, delete on public.categories from authenticated;

alter table public.inventory_items drop constraint inventory_items_category_fkey;
alter table public.categories
  drop constraint categories_parent_fkey,
  drop constraint categories_tenant_id_id_key;
drop index public.categories_unique_name;
drop index public.categories_parent_idx;
drop trigger categories_check_depth on public.categories;
drop function private.categories_check_depth();

-- ---- New columns --------------------------------------------------------------------------
alter table public.categories
  alter column tenant_id drop not null,
  alter column tenant_id drop default,
  add column industry_id uuid references public.industries (id) on delete restrict,
  add column sku_prefix text check (sku_prefix ~ '^[A-Z0-9]{2,6}$'),
  add column icon text check (icon ~ '^[a-z0-9-]{1,40}$'),
  -- RF-18.2: a palette key (src/lib/category-colors.ts) and a path in the public category-images bucket.
  add column color text check (color in ('slate', 'red', 'orange', 'amber', 'yellow', 'lime', 'green', 'emerald',
    'teal', 'cyan', 'sky', 'blue', 'indigo', 'violet', 'purple', 'fuchsia', 'pink', 'rose')),
  add column image_path text check (char_length(image_path) <= 200),
  add column is_archived boolean not null default false,
  add column created_by uuid,
  add column updated_at timestamptz not null default now();

create unique index categories_unique_name on public.categories (industry_id, tenant_id, parent_id, lower(name)) nulls not distinct;
create index categories_industry_idx on public.categories (industry_id, parent_id, sort_order);
create index categories_tenant_idx on public.categories (tenant_id, parent_id, sort_order);
create index categories_parent_idx on public.categories (parent_id);

-- ---- Rules every category row follows -----------------------------------------------------------
-- Scope can't change; a parent is in the same catalog (or, for an organization's own category, in its
-- industry's catalog or its own categories); no cycles; at most 4 levels including the subtree moved.
create function private.categories_validate()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_parent public.categories;
  v_depth integer := 0;
  v_height integer := 1;
  v_cycle boolean := false;
begin
  if tg_op = 'UPDATE' and (new.industry_id is distinct from old.industry_id or new.tenant_id is distinct from old.tenant_id) then
    raise exception 'A category can''t move between catalogs.' using errcode = '22023';
  end if;

  if new.parent_id is not null then
    select * into v_parent from public.categories where id = new.parent_id;
    if not found then
      raise exception 'Parent category not found.' using errcode = '23503';
    end if;
    if new.industry_id is not null then
      if v_parent.industry_id is distinct from new.industry_id then
        raise exception 'The parent must be in the same industry catalog.' using errcode = '22023';
      end if;
    elsif not (v_parent.tenant_id = new.tenant_id
               or (v_parent.tenant_id is null
                   and v_parent.industry_id = (select t.industry_id from public.tenants t where t.id = new.tenant_id))) then
      raise exception 'The parent must be in the organization''s industry catalog or its own categories.' using errcode = '22023';
    end if;

    -- Levels above the new place (the parent's depth), refusing cycles on a move.
    with recursive up as (
      select c.id, c.parent_id, 1 as depth from public.categories c where c.id = new.parent_id
      union all
      select c.id, c.parent_id, up.depth + 1 from public.categories c join up on c.id = up.parent_id where up.depth < 10
    )
    select max(depth), coalesce(bool_or(id = new.id), false) into v_depth, v_cycle from up;
    if v_cycle then
      raise exception 'A category can''t move under itself.' using errcode = '22023';
    end if;
  end if;

  if tg_op = 'UPDATE' then
    with recursive down as (
      select c.id, 1 as height from public.categories c where c.id = new.id
      union all
      select c.id, down.height + 1 from public.categories c join down on c.parent_id = down.id where down.height < 10
    )
    select max(height) into v_height from down;
  end if;

  if v_depth + v_height > 4 then
    raise exception 'Categories can be at most 4 levels deep.' using errcode = '22023';
  end if;

  -- An organization's own category can't repeat a catalog sibling's name.
  if new.tenant_id is not null and exists (
    select 1 from public.categories c
    where c.tenant_id is null and c.parent_id is not distinct from new.parent_id
      and c.industry_id = (select t.industry_id from public.tenants t where t.id = new.tenant_id)
      and lower(c.name) = lower(new.name)
  ) then
    raise exception 'The industry catalog already has a category with this name here.' using errcode = '23505';
  end if;

  new.updated_at := now();
  return new;
end;
$$;
revoke all on function private.categories_validate() from public, anon, authenticated;

create trigger categories_validate
  before insert or update of parent_id, name, industry_id, tenant_id on public.categories
  for each row execute function private.categories_validate();

-- ---- Catalog seeding helper (also used by the console's "Duplicate tree" and CSV import) ----------
-- p_tree: a JSON array; each entry is a name, or {"name", "sku_prefix"?, "icon"?, "children"?}.
create function private.insert_catalog_tree(p_industry_id uuid, p_parent_id uuid, p_tree jsonb)
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
    insert into public.categories (industry_id, parent_id, name, sort_order, sku_prefix, icon)
    values (p_industry_id, p_parent_id,
            case when jsonb_typeof(v_node) = 'string' then v_node #>> '{}' else v_node ->> 'name' end,
            v_pos * 10,
            case when jsonb_typeof(v_node) = 'object' then v_node ->> 'sku_prefix' end,
            case when jsonb_typeof(v_node) = 'object' then v_node ->> 'icon' end)
    returning id into v_id;
    if jsonb_typeof(v_node) = 'object' and v_node ? 'children' then
      perform private.insert_catalog_tree(p_industry_id, v_id, v_node -> 'children');
    end if;
  end loop;
end;
$$;
revoke all on function private.insert_catalog_tree(uuid, uuid, jsonb) from public, anon, authenticated;

-- ---- Hidden catalog categories per organization ------------------------------------------------
create table public.tenant_hidden_categories (
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  category_id uuid not null references public.categories (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (tenant_id, category_id)
);
create index tenant_hidden_categories_category_idx on public.tenant_hidden_categories (category_id);
alter table public.tenant_hidden_categories enable row level security;
revoke all on public.tenant_hidden_categories from anon, authenticated;
grant select on public.tenant_hidden_categories to authenticated;
create policy "Members read their organization's hidden categories" on public.tenant_hidden_categories
  for select to authenticated
  using (tenant_id = (select private.current_tenant_id()));

-- ---- Snapshot before moving the existing shops (checked at the end) ----------------------------------
create temp table _before_items on commit drop as
with recursive p as (
  select c.id, array[c.name] as path from public.categories c where c.parent_id is null
  union all
  select c.id, p.path || c.name from public.categories c join p on c.parent_id = p.id
)
select i.id as item_id, p.path from public.inventory_items i join p on p.id = i.category_id;

create temp table _before_trees on commit drop as
with recursive p as (
  select c.id, c.tenant_id, array[c.name] as path from public.categories c where c.parent_id is null
  union all
  select c.id, c.tenant_id, p.path || c.name from public.categories c join p on c.parent_id = p.id
)
select tenant_id, path from p;

-- ---- Global catalogs -----------------------------------------------------------------------
-- Automotive = the Version 1 default tree (docs/categories.md), with the prefixes and icons that were
-- hard-coded in src/lib/categories.ts.
select private.insert_catalog_tree((select id from public.industries where slug = 'automotive'), null, $json$[
  {"name": "Interior", "sku_prefix": "INT", "icon": "armchair", "children": ["Floor Mats", "Seat Covers", "Steering Wheel Covers", "Gear Shift Covers",
    "Dashboard Covers", "Sun Shades", "Curtains", "Armrests", "Cup Holders", "Tissue Boxes", "Organizers",
    "Car Perfumes", "Air Fresheners"]},
  {"name": "Exterior", "sku_prefix": "EXT", "icon": "car", "children": ["Bumper Guards", "Mud Flaps", "Spoiler Extensions", "Lip Spoilers", "Side Skirts",
    "Window Visors", "License Plate Frames", "Door Edge Guards", "Body Kits", "Chrome Kits", "Decals", "Covers",
    {"name": "Wrapping", "children": ["Vinyl Wraps", "Tinting Film", "PPF",
      {"name": "Wrapping Tools", "children": ["Heat Gun", "Squeegees (Footaa)", "Knives", "Gloves", "Cutting Mat",
        "Tape", "Tweezers", "Wrap Cleaner"]}]}]},
  {"name": "Performance", "sku_prefix": "PRF", "icon": "gauge", "children": ["Filters", "Turbochargers", "Exhaust Systems", "Suspension Systems",
    "Brake Systems", "Drivetrain", "Engine", "Transmission", "Differential", "Axles", "Universal Joints",
    "CV Joints", "Driveshafts", "Propshafts", "Transfer Cases"]},
  {"name": "Electrical", "sku_prefix": "ELC", "icon": "zap", "children": ["Wiring", "Battery", "Fuses & Relays", "Switches", "Sensors"]},
  {"name": "Cleaning & Detailing", "sku_prefix": "CLN", "icon": "spray-can", "children": ["Shampoo", "Polish", "Wax", "Wipes", "Interior Cleaners",
    "Exterior Cleaners", "Glass Cleaners", "Wheel Cleaners", "Tire Cleaners", "Microfiber Cloths", "Sponges",
    "Brushes", "Applicators", "Wash Mitts", "Drying Towels", "Vacuum Cleaners", "Steam Cleaners"]},
  {"name": "Audio", "sku_prefix": "AUD", "icon": "speaker", "children": ["Sound System", "Speakers", "Subwoofers", "Amplifiers", "Wires", "Connectors",
    "Adapters", "Installation Kits", "Video Players", "Navigation Systems"]},
  {"name": "Electronics", "sku_prefix": "ELX", "icon": "cpu", "children": ["Parking Sensors", "Dash Cameras", "Rear View Mirrors", "Air Horns",
    "Fog Lights", "Driving Lights", "Trumpets", "Horns", "Antenna"]},
  {"name": "Security", "sku_prefix": "SEC", "icon": "shield-check", "children": ["Alarms", "Immobilizers", "GPS Trackers", "Steering Wheel Locks", "Pedal Locks"]},
  {"name": "Lighting", "sku_prefix": "LGT", "icon": "lightbulb", "children": ["Headlights", "Taillights", "Bulbs", "Fog Lights", "Driving Lights",
    "Multicolor LEDs", "LEDs", "SMDs", "HIDs", "Neon Lights", "Underglow Lights", "RGB Lights", "Ambiance Lights"]},
  {"name": "Wheels & Tires", "sku_prefix": "WHL", "icon": "disc-3", "children": ["Rims", "Tires", "Tire Pressure Monitoring System", "Tire Shine",
    "Tire Inflator"]},
  {"name": "Tools & Equipment", "sku_prefix": "TLS", "icon": "wrench", "children": ["Handheld Vipers", "Cutter Blades", "Cutters", "Tool Kits", "Zip Ties",
    "Paints", "Spray Paints"]},
  {"name": "Oils & Fluids", "sku_prefix": "OIL", "icon": "droplet", "children": ["Engine Oil", "Transmission Fluid", "Brake Fluid", "Coolant",
    "Power Steering Fluid", "Hydraulic Fluid", "Grease", "Additives"]},
  {"name": "Storage", "sku_prefix": "STO", "icon": "archive", "children": ["Storage Bags", "Organizer Bags"]},
  {"name": "Others", "sku_prefix": "OTH", "icon": "box", "children": ["Key Covers", "Key Shells", "Charger", "USB Cables", "Phone Mounts",
    "Phone Holders", "Ash Tray", "Paper Towels", "Tissue Papers"]}
]$json$::jsonb);


-- ---- Existing shops onto their industry's catalog -----------------------------------------------
-- A shop's category whose full path (exact names) exists in the catalog is replaced by the catalog row;
-- anything else (added or renamed by the shop) stays as that organization's own category, re-parented
-- under the catalog row where its parent matched. Catalog rows the shop had deleted become hidden for it.
create temp table _paths on commit drop as
with recursive p as (
  select c.id, c.tenant_id, c.industry_id, array[c.name] as path from public.categories c where c.parent_id is null
  union all
  select c.id, p.tenant_id, p.industry_id, p.path || c.name from public.categories c join p on c.parent_id = p.id
)
select * from p;

create temp table _match on commit drop as
select t.id as tenant_cat, g.id as global_cat, t.tenant_id
from _paths t
join public.tenants tn on tn.id = t.tenant_id
join _paths g on g.industry_id = tn.industry_id and g.path = t.path
where t.tenant_id is not null;

update public.inventory_items i set category_id = m.global_cat from _match m where i.category_id = m.tenant_cat;

update public.categories c set parent_id = m.global_cat
from _match m
where c.parent_id = m.tenant_cat and c.id not in (select tenant_cat from _match);

insert into public.tenant_hidden_categories (tenant_id, category_id)
select tn.id, g.id
from public.tenants tn
join public.categories g on g.tenant_id is null and g.industry_id = tn.industry_id
where not exists (select 1 from _match m where m.global_cat = g.id and m.tenant_id = tn.id);

delete from public.categories where id in (select tenant_cat from _match);

-- Every item keeps its exact category path and every shop's tree looks the same as before.
do $$
begin
  if exists (
    with recursive p as (
      select c.id, array[c.name] as path from public.categories c where c.parent_id is null
      union all
      select c.id, p.path || c.name from public.categories c join p on c.parent_id = p.id
    )
    select 1 from _before_items b
    join public.inventory_items i on i.id = b.item_id
    left join p on p.id = i.category_id
    where p.path is distinct from b.path
  ) then
    raise exception 'Category migration check failed: an item''s category path changed.';
  end if;

  if exists (
    with recursive p as (
      select c.id, c.tenant_id, c.industry_id, array[c.name] as path from public.categories c where c.parent_id is null
      union all
      select c.id, c.tenant_id, c.industry_id, p.path || c.name from public.categories c join p on c.parent_id = p.id
    ),
    after_trees as (
      select tn.id as tenant_id, p.path
      from public.tenants tn
      join p on p.tenant_id = tn.id
             or (p.tenant_id is null and p.industry_id = tn.industry_id
                 and not exists (select 1 from public.tenant_hidden_categories h where h.tenant_id = tn.id and h.category_id = p.id))
    )
    (select tenant_id, path from _before_trees except select tenant_id, path from after_trees)
    union all
    (select tenant_id, path from after_trees except select tenant_id, path from _before_trees)
  ) then
    raise exception 'Category migration check failed: a shop''s category tree changed.';
  end if;
end;
$$;

-- ---- Structure from here on --------------------------------------------------------------------
alter table public.categories
  add constraint categories_parent_fkey foreign key (parent_id) references public.categories (id),
  add constraint categories_scope_check check (num_nonnulls(industry_id, tenant_id) = 1);

alter table public.inventory_items
  add constraint inventory_items_category_fkey foreign key (category_id) references public.categories (id);

-- Whether a category is in an organization's tree (its industry's catalog minus hidden, plus its own).
create function private.category_visible(p_tenant uuid, p_category uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.categories c
    where c.id = p_category
      and (c.tenant_id = p_tenant
           or (c.tenant_id is null
               and c.industry_id = (select t.industry_id from public.tenants t where t.id = p_tenant)
               and not exists (select 1 from public.tenant_hidden_categories h
                               where h.tenant_id = p_tenant and h.category_id = c.id)))
  );
$$;
revoke all on function private.category_visible(uuid, uuid) from public, anon;
grant execute on function private.category_visible(uuid, uuid) to authenticated, service_role;

-- An item's category must be in its organization's tree and not archived (an item may keep the
-- archived or hidden category it already had).
create function private.check_item_category()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' and new.category_id = old.category_id and new.tenant_id = old.tenant_id then
    return new;
  end if;
  if not private.category_visible(new.tenant_id, new.category_id) then
    raise exception 'That category isn''t available to this organization.' using errcode = '23503';
  end if;
  if (select c.is_archived from public.categories c where c.id = new.category_id) then
    raise exception 'That category is archived.' using errcode = '22023';
  end if;
  return new;
end;
$$;
revoke all on function private.check_item_category() from public, anon, authenticated;

create trigger inventory_items_check_category
  before insert or update of category_id, tenant_id on public.inventory_items
  for each row execute function private.check_item_category();

-- ---- Who reads what ------------------------------------------------------------------------
-- Archived rows stay readable so old items and documents keep their names; pickers filter them out.
create policy "Members read their organization's categories" on public.categories
  for select to authenticated
  using (
    tenant_id = (select private.current_tenant_id())
    or (tenant_id is null
        and industry_id = (select private.current_industry_id())
        and id not in (select h.category_id from public.tenant_hidden_categories h
                       where h.tenant_id = (select private.current_tenant_id())))
  );

-- ---- Category images (RF-18.2): public read, service-role writes only -------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('category-images', 'category-images', true, 1048576, array['image/png', 'image/jpeg', 'image/webp'])
on conflict (id) do nothing;

-- ---- Category requests ------------------------------------------------------------------------
create table public.category_requests (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null default private.current_tenant_id() references public.tenants (id) on delete cascade,
  requested_by uuid default auth.uid() references public.profiles (id) on delete set null,
  name text not null check (name = btrim(name) and char_length(name) between 1 and 60),
  suggested_parent_id uuid references public.categories (id) on delete set null,
  note text check (char_length(note) <= 500),
  status text not null default 'pending'
    check (status in ('pending', 'approved_tenant', 'approved_industry', 'rejected')),
  resolved_by uuid,
  resolution_note text check (char_length(resolution_note) <= 500),
  created_category_id uuid references public.categories (id) on delete set null,
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);
create index category_requests_tenant_idx on public.category_requests (tenant_id, created_at desc);
create index category_requests_pending_idx on public.category_requests (created_at) where status = 'pending';
create index category_requests_parent_idx on public.category_requests (suggested_parent_id);
create index category_requests_created_idx on public.category_requests (created_category_id);
create index category_requests_requester_idx on public.category_requests (requested_by);

alter table public.category_requests enable row level security;
revoke all on public.category_requests from anon, authenticated;
grant select on public.category_requests to authenticated;
grant insert (name, suggested_parent_id, note) on public.category_requests to authenticated;

create policy "Members read their organization's category requests" on public.category_requests
  for select to authenticated
  using (tenant_id = (select private.current_tenant_id()));

create policy "Members request categories" on public.category_requests
  for insert to authenticated
  with check (tenant_id = (select private.current_tenant_id()) and requested_by = (select auth.uid()) and status = 'pending');

-- At most 20 requests a day per organization; the suggested parent must be in its tree.
create function private.category_requests_check()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select count(*) from public.category_requests r
      where r.tenant_id = new.tenant_id and r.created_at > now() - interval '1 day') >= 20 then
    raise exception 'Too many category requests today. Try again tomorrow.' using errcode = '54000';
  end if;
  if new.suggested_parent_id is not null and not private.category_visible(new.tenant_id, new.suggested_parent_id) then
    raise exception 'Suggested parent category not found.' using errcode = '23503';
  end if;
  return new;
end;
$$;
revoke all on function private.category_requests_check() from public, anon, authenticated;

create trigger category_requests_check
  before insert on public.category_requests
  for each row execute function private.category_requests_check();

-- ---- Sign-up picks the industry --------------------------------------------------------------
-- raw_user_meta_data.industry_id (the sign-up form, or the console's Create Organization); unknown or
-- missing → General Retail. The industry's default modules and settings come from tenants_industry_defaults.
create or replace function public.handle_new_shop_registration()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_shop_name text := nullif(trim(new.raw_user_meta_data ->> 'shop_name'), '');
  v_full_name text := coalesce(nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''), split_part(new.email, '@', 1));
  v_industry_text text := new.raw_user_meta_data ->> 'industry_id';
  v_industry_id uuid;
  v_base_slug text;
  v_tenant_id uuid;
begin
  if v_shop_name is null then
    return new;
  end if;

  if v_industry_text ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    select id into v_industry_id from public.industries where id = v_industry_text::uuid;
  end if;
  if v_industry_id is null then
    select id into v_industry_id from public.industries where slug = 'general-retail';
  end if;

  v_base_slug := trim(both '-' from regexp_replace(lower(v_shop_name), '[^a-z0-9]+', '-', 'g'));
  if v_base_slug = '' then
    v_base_slug := 'shop';
  end if;

  insert into public.tenants (name, slug, email, industry_id)
  values (v_shop_name, v_base_slug || '-' || substr(replace(new.id::text, '-', ''), 1, 6), new.email, v_industry_id)
  returning id into v_tenant_id;

  insert into public.profiles (id, tenant_id, full_name, email, role)
  values (new.id, v_tenant_id, v_full_name, new.email, 'admin');

  return new;
end;
$$;

-- ---- Console RPCs (service role only) -----------------------------------------------------------
-- Items and organizations using each category of an industry's catalog (directly on it).
create function public.admin_category_usage(p_industry uuid)
returns table (category_id uuid, items bigint, tenants bigint)
language sql
stable
set search_path = ''
as $$
  select i.category_id, count(*), count(distinct i.tenant_id)
  from public.inventory_items i
  join public.categories c on c.id = i.category_id
  where c.industry_id = p_industry
  group by i.category_id;
$$;
revoke all on function public.admin_category_usage(uuid) from public, anon, authenticated;
grant execute on function public.admin_category_usage(uuid) to service_role;

-- Moves an organization to another industry. p_mapping = {"<old category id>": "<new category id>"} for
-- every category its items use that won't survive: the old catalog, and its own categories that sit under
-- the old catalog (deleted afterwards). Its own top-level categories stay. All or nothing.
create function public.admin_remap_tenant_industry(p_tenant uuid, p_new_industry uuid, p_mapping jsonb)
returns integer
language plpgsql
set search_path = ''
as $$
declare
  v_old_industry uuid;
  v_missing integer;
  v_moved integer;
begin
  select industry_id into v_old_industry from public.tenants where id = p_tenant for update;
  if not found then
    raise exception 'Organization not found.' using errcode = 'P0002';
  end if;
  if not exists (select 1 from public.industries where id = p_new_industry) then
    raise exception 'Industry not found.' using errcode = 'P0002';
  end if;
  if v_old_industry = p_new_industry then
    return 0;
  end if;

  -- Categories that go away: the old catalog and the organization's own categories below it.
  create temp table _dying on commit drop as
  with recursive own_under as (
    select c.id from public.categories c
    join public.categories parent on parent.id = c.parent_id
    where c.tenant_id = p_tenant and parent.tenant_id is null
    union all
    select c.id from public.categories c join own_under o on c.parent_id = o.id
  )
  select id from own_under
  union
  select id from public.categories where industry_id = v_old_industry;

  -- Every dying category in use needs a target in the new catalog or the organization's surviving own categories.
  select count(*) into v_missing
  from (select distinct i.category_id from public.inventory_items i
        where i.tenant_id = p_tenant and i.category_id in (select id from _dying)) used
  left join public.categories target on target.id = (p_mapping ->> used.category_id::text)::uuid
  where target.id is null
     or target.is_archived
     or target.id in (select id from _dying)
     or not (target.industry_id = p_new_industry or target.tenant_id = p_tenant);
  if v_missing > 0 then
    raise exception '% categories in use still need a valid new category.', v_missing using errcode = '22023';
  end if;

  update public.tenants set industry_id = p_new_industry, updated_at = now() where id = p_tenant;
  delete from public.tenant_hidden_categories where tenant_id = p_tenant;

  update public.inventory_items i
  set category_id = (p_mapping ->> i.category_id::text)::uuid, updated_at = now()
  where i.tenant_id = p_tenant and i.category_id in (select id from _dying);
  get diagnostics v_moved = row_count;

  update public.category_requests set suggested_parent_id = null
  where tenant_id = p_tenant and suggested_parent_id in (select id from _dying);
  delete from public.categories where tenant_id = p_tenant and id in (select id from _dying);

  return v_moved;
end;
$$;
revoke all on function public.admin_remap_tenant_industry(uuid, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.admin_remap_tenant_industry(uuid, uuid, jsonb) to service_role;
