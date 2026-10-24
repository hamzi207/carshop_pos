-- Phase 18 (4/4): custom product attributes (RF-18.1), onboarding checklist (RF-18.3) and the Vehicle
-- Fitment module switch in the database (docs/upgrade-plan.md Phase 18, deliverables 6, 9 and 11).

-- ---- Attribute definitions --------------------------------------------------------------------
-- Scope: an industry (every organization in it) or one organization. Optionally narrowed to a category,
-- which covers that category and everything below it. Only the service role writes.
create table public.category_attributes (
  id uuid primary key default gen_random_uuid(),
  industry_id uuid references public.industries (id) on delete cascade,
  tenant_id uuid references public.tenants (id) on delete cascade,
  category_id uuid references public.categories (id) on delete cascade,
  key text not null check (key ~ '^[a-z][a-z0-9_]{0,39}$'),
  label text not null check (label = btrim(label) and char_length(label) between 1 and 60),
  type text not null check (type in ('text', 'number', 'date', 'boolean', 'select')),
  options text[] not null default '{}' check (cardinality(options) <= 50),
  is_required boolean not null default false,
  show_on_documents boolean not null default false,
  sort_order integer not null default 0,
  is_archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint category_attributes_scope_check check (num_nonnulls(industry_id, tenant_id) = 1),
  constraint category_attributes_select_options_check check ((type = 'select') = (cardinality(options) > 0))
);
create unique index category_attributes_key on public.category_attributes (industry_id, tenant_id, key) nulls not distinct;
create index category_attributes_tenant_idx on public.category_attributes (tenant_id);
create index category_attributes_category_idx on public.category_attributes (category_id);

-- The category must be in the attribute's scope (that industry's catalog, or the organization's tree), and an
-- organization's own key can't repeat one of its industry's keys.
create function private.category_attributes_validate()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.category_id is not null then
    if new.industry_id is not null
       and not exists (select 1 from public.categories c where c.id = new.category_id and c.industry_id = new.industry_id) then
      raise exception 'The category must be in this industry''s catalog.' using errcode = '22023';
    end if;
    if new.tenant_id is not null and not private.category_visible(new.tenant_id, new.category_id) then
      raise exception 'The category must be in this organization''s categories.' using errcode = '22023';
    end if;
  end if;
  if new.tenant_id is not null and exists (
    select 1 from public.category_attributes a
    where a.industry_id = (select t.industry_id from public.tenants t where t.id = new.tenant_id) and a.key = new.key
  ) then
    raise exception 'The industry already has an attribute with this key.' using errcode = '23505';
  end if;
  new.updated_at := now();
  return new;
end;
$$;
revoke all on function private.category_attributes_validate() from public, anon, authenticated;

create trigger category_attributes_validate
  before insert or update on public.category_attributes
  for each row execute function private.category_attributes_validate();

alter table public.category_attributes enable row level security;
revoke all on public.category_attributes from anon, authenticated;
grant select on public.category_attributes to authenticated;
create policy "Members read their organization's attributes" on public.category_attributes
  for select to authenticated
  using (industry_id = (select private.current_industry_id()) or tenant_id = (select private.current_tenant_id()));

-- Attributes that apply to an item of this organization in this category (not archived).
create function private.applicable_attributes(p_tenant uuid, p_category uuid)
returns setof public.category_attributes
language sql
stable
security definer
set search_path = ''
as $$
  with recursive up as (
    select c.id, c.parent_id from public.categories c where c.id = p_category
    union all
    select c.id, c.parent_id from public.categories c join up on c.id = up.parent_id
  )
  select a.*
  from public.category_attributes a
  where not a.is_archived
    and (a.tenant_id = p_tenant or a.industry_id = (select t.industry_id from public.tenants t where t.id = p_tenant))
    and (a.category_id is null or a.category_id in (select id from up));
$$;
revoke all on function private.applicable_attributes(uuid, uuid) from public, anon;
grant execute on function private.applicable_attributes(uuid, uuid) to authenticated, service_role;

-- ---- Attribute values on items ---------------------------------------------------------------------
alter table public.inventory_items
  add column attributes jsonb not null default '{}' check (jsonb_typeof(attributes) = 'object');
grant insert (attributes), update (attributes) on public.inventory_items to authenticated;

-- Values are keyed by attribute key. Each value must match its type; required ones must be filled.
-- Keys of attributes that don't apply any more (archived, or another category) are kept so nothing is lost;
-- keys no attribute of the organization ever had are refused.
create function private.check_item_attributes()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_attr public.category_attributes;
  v_value jsonb;
  v_key text;
begin
  -- Empty strings and nulls mean "not set".
  new.attributes := coalesce((
    select jsonb_object_agg(e.key, e.value)
    from jsonb_each(new.attributes) e
    where e.value <> 'null'::jsonb and e.value <> '""'::jsonb
  ), '{}');

  for v_key in select jsonb_object_keys(new.attributes) loop
    if not exists (
      select 1 from public.category_attributes a
      where a.key = v_key
        and (a.tenant_id = new.tenant_id or a.industry_id = (select t.industry_id from public.tenants t where t.id = new.tenant_id))
    ) then
      raise exception 'Unknown attribute "%".', v_key using errcode = '22023';
    end if;
  end loop;

  for v_attr in select * from private.applicable_attributes(new.tenant_id, new.category_id) loop
    v_value := new.attributes -> v_attr.key;
    if v_value is null then
      if v_attr.is_required then
        raise exception '% is required.', v_attr.label using errcode = '23502';
      end if;
      continue;
    end if;
    if (v_attr.type = 'number' and jsonb_typeof(v_value) <> 'number')
       or (v_attr.type = 'boolean' and jsonb_typeof(v_value) <> 'boolean')
       or (v_attr.type in ('text', 'date', 'select') and jsonb_typeof(v_value) <> 'string')
       or (v_attr.type = 'text' and char_length(v_value #>> '{}') > 200)
       or (v_attr.type = 'date' and (v_value #>> '{}') !~ '^\d{4}-\d{2}-\d{2}$')
       or (v_attr.type = 'select' and not ((v_value #>> '{}') = any (v_attr.options))) then
      raise exception '% has an invalid value.', v_attr.label using errcode = '22023';
    end if;
  end loop;
  return new;
end;
$$;
revoke all on function private.check_item_attributes() from public, anon, authenticated;

create trigger inventory_items_check_attributes
  before insert or update of attributes, category_id on public.inventory_items
  for each row execute function private.check_item_attributes();

-- ---- save_inventory_item: + attributes; respects the Vehicle Fitment module ---------------------------
-- With the module off, new items are universal and an edit leaves the stored fitment as it was, so
-- switching the module back on restores it.
drop function public.save_inventory_item(text, text, uuid, numeric, numeric, integer, integer, boolean, uuid, text, integer[], boolean, text);

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
  p_vendor_name text default null,
  p_attributes jsonb default '{}'
)
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  v_tenant_id uuid := public.current_tenant_id();
  v_fitment boolean;
  v_item_id uuid;
begin
  if v_tenant_id is null then
    raise exception 'Not authenticated.' using errcode = '42501';
  end if;
  v_fitment := private.tenant_has_module(v_tenant_id, 'vehicle_fitment');

  if v_fitment and not p_is_universal and coalesce(cardinality(p_vehicle_ids), 0) = 0 then
    raise exception 'Vehicle-specific items need at least one vehicle.' using errcode = '22023';
  end if;

  if p_item_id is null then
    insert into public.inventory_items (
      tenant_id, sku, name, description, category_id, cost_price, selling_price,
      quantity_on_hand, low_stock_threshold, is_universal, price_includes_tax, vendor_name, attributes
    )
    values (
      v_tenant_id, p_sku, p_name, p_description, p_category_id, p_cost_price, p_selling_price,
      p_quantity_on_hand, p_low_stock_threshold, p_is_universal or not v_fitment, p_price_includes_tax,
      nullif(btrim(p_vendor_name), ''), coalesce(p_attributes, '{}')
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
        is_universal = case when v_fitment then p_is_universal else is_universal end,
        price_includes_tax = p_price_includes_tax,
        vendor_name = nullif(btrim(p_vendor_name), ''),
        attributes = coalesce(p_attributes, '{}'),
        updated_at = now()
    where id = p_item_id and tenant_id = v_tenant_id
    returning id into v_item_id;

    if v_item_id is null then
      raise exception 'Inventory item not found.' using errcode = 'P0002';
    end if;

    if v_fitment then
      delete from public.item_vehicle_compatibility
      where item_id = v_item_id and tenant_id = v_tenant_id;
    end if;
  end if;

  if v_fitment and not p_is_universal then
    insert into public.item_vehicle_compatibility (tenant_id, item_id, vehicle_id)
    select distinct v_tenant_id, v_item_id, vehicle_id
    from unnest(p_vehicle_ids) as vehicle_id;
  end if;

  return v_item_id;
end;
$$;

revoke all on function public.save_inventory_item(text, text, uuid, numeric, numeric, integer, integer, boolean, uuid, text, integer[], boolean, text, jsonb) from public, anon;
grant execute on function public.save_inventory_item(text, text, uuid, numeric, numeric, integer, integer, boolean, uuid, text, integer[], boolean, text, jsonb) to authenticated;

-- ---- Search: vehicles only with the module on; attribute values are searchable too -----------------------
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
  ),
  fitment as (
    select private.tenant_has_module(private.current_tenant_id(), 'vehicle_fitment') as enabled
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
      where c.item_id = i.id and (select f.enabled from fitment f)
    ) fit
    left join public.vehicles v on v.id = fit.vehicle_id
    where not exists (
      select 1
      from tokens t
      where strpos(
        regexp_replace(
          lower(concat_ws(' ', i.sku, i.name, ct.names, v.make, v.model, v."trim", v.year::text,
            (select string_agg(e.value, ' ') from jsonb_each_text(i.attributes) e))),
          '[^[:alnum:][:space:]]', '', 'g'
        ),
        t.token
      ) = 0
    )
  );
$$;

-- ---- add_vehicle: only for organizations with Vehicle Fitment ----------------------------------------
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
  if not private.tenant_has_module(v_tenant_id, 'vehicle_fitment') then
    raise exception 'Vehicle Fitment is switched off for this organization.' using errcode = '42501';
  end if;
  if p_year is null or p_year < 1960 or p_year > extract(year from now())::integer + 1 then
    raise exception 'Choose a year from 1960 to %.', extract(year from now())::integer + 1 using errcode = '22023';
  end if;
  if char_length(v_make) not between 1 and 64 or char_length(v_model) not between 1 and 64 then
    raise exception 'Enter a make and model (up to 64 characters each).' using errcode = '22023';
  end if;

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

-- ---- Onboarding checklist (RF-18.3) -----------------------------------------------------------------
-- Each step is worked out from the organization's own data, in its industry's order.
create function private.onboarding_status(p_tenant uuid)
returns table (step text, done boolean, step_order integer)
language sql
stable
security definer
set search_path = ''
as $$
  select s.step,
    case s.step
      when 'profile' then nullif(btrim(t.address), '') is not null and nullif(btrim(t.phone), '') is not null
      when 'logo' then t.logo_url is not null
      when 'payment_details' then coalesce(nullif(btrim(t.bank_account_number), ''), nullif(btrim(t.bank_iban), ''),
                                           nullif(btrim(t.bank_raast_id), '')) is not null
                                  or jsonb_array_length(case when jsonb_typeof(t.bank_wallets) = 'array' then t.bank_wallets else '[]' end) > 0
      when 'products' then exists (select 1 from public.inventory_items i where i.tenant_id = t.id)
      when 'opening_stock' then exists (select 1 from public.inventory_items i where i.tenant_id = t.id and i.quantity_on_hand > 0)
      when 'customer' then exists (select 1 from public.customers c where c.tenant_id = t.id)
      when 'team' then (select count(*) from public.profiles p where p.tenant_id = t.id) > 1
      when 'first_quotation' then exists (select 1 from public.quotes q where q.tenant_id = t.id and q.quotation_number is not null)
      when 'first_invoice' then exists (select 1 from public.quotes q where q.tenant_id = t.id and q.invoice_number is not null)
      else false
    end,
    s.step_order::integer
  from public.tenants t
  join public.industries i on i.id = t.industry_id
  cross join lateral unnest(i.onboarding_steps) with ordinality as s(step, step_order)
  where t.id = p_tenant;
$$;
revoke all on function private.onboarding_status(uuid) from public, anon, authenticated;

-- The caller's organization (follows Login As): steps in order, plus whether the card was dismissed.
create function public.my_onboarding()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'dismissed', (select t.onboarding_dismissed_at is not null from public.tenants t where t.id = private.current_tenant_id()),
    'steps', coalesce((select jsonb_agg(jsonb_build_object('step', s.step, 'done', s.done) order by s.step_order)
                       from private.onboarding_status(private.current_tenant_id()) s), '[]')
  );
$$;
revoke all on function public.my_onboarding() from public, anon;
grant execute on function public.my_onboarding() to authenticated;

-- Console: one organization's steps, or every organization's done / total (shops list "Setup %").
create function public.admin_onboarding(p_tenant uuid)
returns table (step text, done boolean)
language sql
stable
set search_path = ''
as $$
  select s.step, s.done from private.onboarding_status(p_tenant) s order by s.step_order;
$$;
revoke all on function public.admin_onboarding(uuid) from public, anon, authenticated;
grant execute on function public.admin_onboarding(uuid) to service_role;

create function public.admin_onboarding_summary()
returns table (tenant_id uuid, done integer, total integer)
language sql
stable
set search_path = ''
as $$
  select t.id, count(*) filter (where s.done)::integer, count(s.step)::integer
  from public.tenants t
  cross join lateral private.onboarding_status(t.id) s
  group by t.id;
$$;
revoke all on function public.admin_onboarding_summary() from public, anon, authenticated;
grant execute on function public.admin_onboarding_summary() to service_role;

grant execute on function private.onboarding_status(uuid) to service_role;
