-- =============================================================================
-- docs/changes.md: schema for tax identity, walk-in sales, line discounts,
-- discount reasons, quotation validity, stock reservations, vendors and
-- dashboard preferences.
-- =============================================================================

-- ---- Customers (§2, §4) --------------------------------------------------------
-- tax_id becomes cnic_or_ntn, stored normalised: CNIC 12345-1234567-1,
-- NTN 1234567-8 (older NTNs have no check digit: 1234567). STRN: 13 digits.
alter table public.customers rename column tax_id to cnic_or_ntn;
alter table public.customers alter column cnic_or_ntn type varchar(20);

alter table public.customers
  add column strn varchar(20),
  add column tax_registration_status text not null default 'unregistered'
    constraint customers_tax_registration_check check (tax_registration_status in ('unregistered', 'registered')),
  add column default_discount_percentage numeric(5,2) not null default 0.00
    constraint customers_default_discount_check check (default_discount_percentage between 0 and 100),
  -- One per shop: the "Walk-in / Cash Customer" that cash sales are billed to.
  add column is_walk_in boolean not null default false;

-- The walk-in record has no phone of its own; everyone else still needs WhatsApp.
alter table public.customers alter column whatsapp_number drop not null;

alter table public.customers
  add constraint customers_whatsapp_required_check check (is_walk_in or whatsapp_number is not null),
  add constraint customers_cnic_or_ntn_format_check
    check (cnic_or_ntn is null or cnic_or_ntn ~ '^([0-9]{5}-[0-9]{7}-[0-9]|[0-9]{7}(-[0-9])?)$'),
  add constraint customers_strn_format_check check (strn is null or strn ~ '^[0-9]{13}$'),
  -- FBR sales tax invoices: business (B2B) and sales-tax-registered buyers
  -- must be identified by CNIC or NTN; registered buyers also by STRN.
  add constraint customers_tax_identity_check check (
    is_walk_in
    or (customer_type = 'Retail Customer' and tax_registration_status = 'unregistered')
    or cnic_or_ntn is not null
  ),
  add constraint customers_strn_required_check check (tax_registration_status = 'unregistered' or strn is not null);

create unique index uq_customers_walk_in on public.customers (tenant_id) where is_walk_in;

-- The walk-in record can't be edited or deleted by users.
alter policy "Tenant isolation for customers update" on public.customers
  using (tenant_id = public.current_tenant_id() and not is_walk_in)
  with check (tenant_id = public.current_tenant_id() and not is_walk_in);
alter policy "Tenant isolation for customers delete" on public.customers
  using (tenant_id = public.current_tenant_id() and not is_walk_in);

-- Every shop gets its walk-in customer (existing shops now, new shops on sign-up).
create or replace function public.create_walk_in_customer()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.customers (tenant_id, name, customer_type, is_walk_in)
  values (new.id, 'Walk-in / Cash Customer', 'Retail Customer', true);
  return new;
end;
$$;
revoke execute on function public.create_walk_in_customer() from public, anon, authenticated;

create trigger tenants_create_walk_in_customer
  after insert on public.tenants
  for each row execute function public.create_walk_in_customer();

insert into public.customers (tenant_id, name, customer_type, is_walk_in)
select t.id, 'Walk-in / Cash Customer', 'Retail Customer', true
from public.tenants t
where not exists (select 1 from public.customers c where c.tenant_id = t.id and c.is_walk_in);

-- Customer search: new tax columns; the walk-in record is never a search hit.
create or replace function public.search_customers(p_query text)
returns setof public.customers
language sql
stable
security invoker
set search_path = ''
as $$
  with tokens as (
    select distinct token
    from unnest(
      regexp_split_to_array(
        regexp_replace(lower(coalesce(p_query, '')), '[^[:alnum:][:space:]]', '', 'g'),
        '\s+'
      )
    ) as token
    where token <> ''
  )
  select c.*
  from public.customers c
  where not c.is_walk_in
    and not exists (
      select 1
      from tokens t
      where strpos(
        regexp_replace(
          lower(concat_ws(' ',
            c.name, c.contact_person, c.email, c.cnic_or_ntn, c.strn,
            c.whatsapp_number,
            case when c.whatsapp_number like '+92%' then '0' || substr(c.whatsapp_number, 4) end,
            c.phone,
            case when c.phone like '+92%' then '0' || substr(c.phone, 4) end
          )),
          '[^[:alnum:][:space:]]', '', 'g'
        ),
        t.token
      ) = 0
    );
$$;

-- ---- Sales documents (§2.1, §3, §5) -------------------------------------------
alter table public.quotes
  -- Walk-in sales: contact details kept on the document only.
  add column walk_in_name text,
  add column walk_in_phone text
    constraint quotes_walk_in_phone_e164_check check (walk_in_phone is null or walk_in_phone ~ '^\+[1-9][0-9]{7,14}$'),
  -- Required whenever there is a document-level discount.
  add column discount_reason text,
  -- Quotations: offer validity (stock stays reserved until cancelled, deleted or invoiced).
  add column valid_until timestamptz,
  add constraint quotes_discount_reason_check
    check (discount_amount = 0 or nullif(btrim(discount_reason), '') is not null);

alter table public.quote_items
  add column discount_type text not null default 'percent'
    constraint quote_items_discount_type_check check (discount_type in ('percent', 'amount')),
  add column discount_value numeric(12,2) not null default 0
    constraint quote_items_discount_value_check check (discount_value >= 0),
  add column discount_amount numeric(12,2) not null default 0
    constraint quote_items_discount_amount_check check (discount_amount >= 0),
  -- Stock this line currently holds: reserved (quotation) or deducted (invoice).
  add column reserved_qty integer not null default 0 constraint quote_items_reserved_qty_check check (reserved_qty >= 0),
  add column deducted_qty integer not null default 0 constraint quote_items_deducted_qty_check check (deducted_qty >= 0),
  -- Stock is counted in whole units.
  add constraint quote_items_whole_part_quantity_check check (is_labor or item_id is null or quantity = trunc(quantity));

-- ---- Products (§5.2, §6) --------------------------------------------------------
alter table public.inventory_items
  add column reserved_quantity integer not null default 0,
  add column vendor_name varchar(255),
  add constraint inventory_reserved_within_stock
    check (reserved_quantity >= 0 and reserved_quantity <= quantity_on_hand);

-- reserved_quantity is maintained by triggers only.
revoke insert, update on public.inventory_items from authenticated;
grant insert (id, tenant_id, sku, name, description, category, cost_price, selling_price, quantity_on_hand,
              low_stock_threshold, is_universal, price_includes_tax, vendor_name, created_at, updated_at)
  on public.inventory_items to authenticated;
grant update (sku, name, description, category, cost_price, selling_price, quantity_on_hand,
              low_stock_threshold, is_universal, price_includes_tax, vendor_name, updated_at)
  on public.inventory_items to authenticated;

-- ---- Settings ---------------------------------------------------------------------
alter table public.tenants
  add column quote_validity_days integer not null default 2
    constraint tenants_quote_validity_days_check check (quote_validity_days between 1 and 365);
grant update (quote_validity_days) on public.tenants to authenticated;

-- Per-user dashboard layout (§7.2).
alter table public.profiles add column dashboard_prefs jsonb not null default '{}'::jsonb;
grant update (dashboard_prefs) on public.profiles to authenticated;
