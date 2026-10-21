-- Phase 17 (part 2, deliverable 9): subscription plans with manual payments.
-- Organizations pay ProductLogik by mobile wallet or bank transfer; nothing is charged online.
-- The superadmin manages plans (prices per cycle, limits, modules, trial), assigns one to each
-- organization (with an agreed price, discount and limit overrides), issues subscription invoices,
-- and records or verifies payments. A daily run issues invoices, queues reminders, marks
-- organizations past due and suspends them after the grace days. Plan limits are enforced here.

-- ---------------------------------------------------------------------------
-- Plans (global, superadmin only)
-- ---------------------------------------------------------------------------
create table public.subscription_plans (
  id uuid primary key default gen_random_uuid(),
  name text not null constraint subscription_plans_name_check check (char_length(name) between 1 and 60),
  code text not null constraint subscription_plans_code_check check (code ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(code) <= 40),
  description text constraint subscription_plans_description_check check (char_length(description) <= 500),
  -- standard: listed and usable as the sign-up default; custom: one negotiated deal, hidden by default.
  visibility text not null default 'standard' constraint subscription_plans_visibility_check check (visibility in ('standard', 'custom')),
  -- PKR per cycle; null = the plan doesn't offer that cycle (at least one is required).
  price_monthly numeric(12, 2) constraint subscription_plans_monthly_check check (price_monthly >= 0),
  price_yearly numeric(12, 2) constraint subscription_plans_yearly_check check (price_yearly >= 0),
  -- null = unlimited
  max_stores integer constraint subscription_plans_stores_check check (max_stores >= 1),
  max_users integer constraint subscription_plans_users_check check (max_users >= 1),
  max_products integer constraint subscription_plans_products_check check (max_products >= 1),
  -- null = every module; otherwise only these (Phase 18 adds the modules).
  allowed_modules text[],
  trial_days integer not null default 14 constraint subscription_plans_trial_check check (trial_days between 0 and 365),
  sort_order integer not null default 0,
  retired_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint subscription_plans_cycle_check check (price_monthly is not null or price_yearly is not null)
);
create unique index subscription_plans_code_key on public.subscription_plans (code);

-- ---------------------------------------------------------------------------
-- Platform billing settings
-- ---------------------------------------------------------------------------
alter table public.platform_settings
  add column default_plan_id uuid references public.subscription_plans (id) on delete set null,
  -- Invoices are created this many days before each period starts.
  add column invoice_lead_days integer not null default 7 constraint platform_settings_lead_days_check check (invoice_lead_days between 0 and 60),
  add column default_grace_days integer not null default 7 constraint platform_settings_grace_days_check check (default_grace_days between 0 and 60),
  -- Reminder emails this many days before the due date (0 = on the due date).
  add column reminder_days integer[] not null default '{7,3,0}' constraint platform_settings_reminder_days_check check (cardinality(reminder_days) <= 6);

-- ---------------------------------------------------------------------------
-- Each organization's subscription (one row per organization)
-- ---------------------------------------------------------------------------
create table public.tenant_subscriptions (
  tenant_id uuid primary key references public.tenants (id) on delete cascade,
  plan_id uuid not null references public.subscription_plans (id) on delete restrict,
  billing_cycle text not null default 'monthly' constraint tenant_subscriptions_cycle_check check (billing_cycle in ('monthly', 'yearly')),
  -- trial / active: in use; past_due: due date passed, in the grace days; suspended: unpaid after the
  -- grace days; cancelled: ended after the paid period.
  status text not null default 'active' constraint tenant_subscriptions_status_check check (status in ('trial', 'active', 'past_due', 'suspended', 'cancelled')),
  -- Price per cycle agreed with this organization; null = the plan's current price for the cycle.
  agreed_price numeric(12, 2) constraint tenant_subscriptions_agreed_price_check check (agreed_price >= 0),
  discount_type text not null default 'none' constraint tenant_subscriptions_discount_type_check check (discount_type in ('none', 'amount', 'percent')),
  discount_value numeric(12, 2) not null default 0 constraint tenant_subscriptions_discount_value_check check (discount_value >= 0 and (discount_type <> 'percent' or discount_value <= 100)),
  price_note text constraint tenant_subscriptions_price_note_check check (char_length(price_note) <= 300),
  -- Limit overrides for this organization only (null = the plan's limit).
  max_stores integer constraint tenant_subscriptions_stores_check check (max_stores >= 1),
  max_users integer constraint tenant_subscriptions_users_check check (max_users >= 1),
  max_products integer constraint tenant_subscriptions_products_check check (max_products >= 1),
  allowed_modules text[],
  started_at date not null default current_date,
  trial_ends_at date,
  -- Last day covered by a paid invoice.
  paid_until date,
  -- When the next period starts (its invoice is due that day); null for a free plan.
  next_due_date date,
  grace_days integer not null default 7 constraint tenant_subscriptions_grace_check check (grace_days between 0 and 60),
  auto_suspend boolean not null default true,
  -- A plan change that waits for the next period.
  pending_plan_id uuid references public.subscription_plans (id) on delete set null,
  pending_billing_cycle text constraint tenant_subscriptions_pending_cycle_check check (pending_billing_cycle in ('monthly', 'yearly')),
  -- Cancel: usable until the end of the paid period, then "Subscription ended".
  cancel_at date,
  -- Set by the superadmin when changing the row; recorded in the history by a trigger.
  updated_by uuid references auth.users (id) on delete set null,
  change_reason text constraint tenant_subscriptions_change_reason_check check (char_length(change_reason) <= 300),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index tenant_subscriptions_plan_idx on public.tenant_subscriptions (plan_id);
create index tenant_subscriptions_due_idx on public.tenant_subscriptions (next_due_date);

create table public.tenant_subscription_history (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  action text not null,
  before jsonb,
  after jsonb,
  reason text,
  changed_by uuid references auth.users (id) on delete set null,
  changed_at timestamptz not null default now()
);
create index tenant_subscription_history_tenant_idx on public.tenant_subscription_history (tenant_id, changed_at desc);

create or replace function private.tenant_subscriptions_history()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_old jsonb := case when tg_op = 'UPDATE' then to_jsonb(old) - 'updated_at' - 'updated_by' - 'change_reason' end;
  v_new jsonb := to_jsonb(new) - 'updated_at' - 'updated_by' - 'change_reason';
begin
  if tg_op = 'UPDATE' and v_old = v_new then
    return new;
  end if;
  insert into public.tenant_subscription_history (tenant_id, action, before, after, reason, changed_by)
  values (
    new.tenant_id,
    case when tg_op = 'INSERT' then 'created' else 'changed' end,
    -- only the fields that changed
    case when tg_op = 'UPDATE' then (select jsonb_object_agg(k, v_old -> k) from jsonb_object_keys(v_new) k where v_old -> k is distinct from v_new -> k) end,
    case when tg_op = 'UPDATE' then (select jsonb_object_agg(k, v_new -> k) from jsonb_object_keys(v_new) k where v_old -> k is distinct from v_new -> k) else v_new end,
    new.change_reason,
    new.updated_by
  );
  return new;
end;
$$;
create trigger tenant_subscriptions_history
  after insert or update on public.tenant_subscriptions
  for each row execute function private.tenant_subscriptions_history();

-- ---------------------------------------------------------------------------
-- Pending adjustments (charges or credits added to the next invoice)
-- ---------------------------------------------------------------------------
create table public.subscription_adjustments (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  description text not null constraint subscription_adjustments_description_check check (char_length(description) between 1 and 200),
  -- positive = charge, negative = credit
  amount numeric(12, 2) not null constraint subscription_adjustments_amount_check check (amount <> 0),
  invoice_id uuid,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);
create index subscription_adjustments_pending_idx on public.subscription_adjustments (tenant_id) where invoice_id is null;

-- ---------------------------------------------------------------------------
-- Subscription invoices (ProductLogik → organization)
-- ---------------------------------------------------------------------------
create sequence public.subscription_invoice_seq;

create table public.subscription_invoices (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  number text not null,
  plan_id uuid references public.subscription_plans (id) on delete set null,
  plan_name text not null,
  billing_cycle text not null constraint subscription_invoices_cycle_check check (billing_cycle in ('monthly', 'yearly')),
  period_start date not null,
  period_end date not null,
  issue_date date not null default current_date,
  due_date date not null,
  subtotal numeric(12, 2) not null,
  discount numeric(12, 2) not null default 0,
  adjustments numeric(12, 2) not null default 0,
  total numeric(12, 2) not null constraint subscription_invoices_total_check check (total >= 0),
  amount_paid numeric(12, 2) not null default 0,
  status text not null default 'unpaid' constraint subscription_invoices_status_check check (status in ('unpaid', 'partly_paid', 'paid', 'void')),
  void_reason text constraint subscription_invoices_void_reason_check check (char_length(void_reason) <= 300),
  emailed_at timestamptz,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  constraint subscription_invoices_period_check check (period_end >= period_start),
  constraint subscription_invoices_void_check check (status <> 'void' or void_reason is not null)
);
create unique index subscription_invoices_number_key on public.subscription_invoices (number);
-- The daily run can't bill the same period twice.
create unique index subscription_invoices_period_key on public.subscription_invoices (tenant_id, period_start) where status <> 'void';
create index subscription_invoices_tenant_idx on public.subscription_invoices (tenant_id, period_start desc);
create index subscription_invoices_open_idx on public.subscription_invoices (due_date) where status in ('unpaid', 'partly_paid');

alter table public.subscription_adjustments
  add constraint subscription_adjustments_invoice_fkey foreign key (invoice_id) references public.subscription_invoices (id) on delete set null;

create table public.subscription_invoice_lines (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references public.subscription_invoices (id) on delete cascade,
  kind text not null constraint subscription_invoice_lines_kind_check check (kind in ('plan', 'discount', 'adjustment')),
  description text not null,
  amount numeric(12, 2) not null,
  sort_order integer not null default 0
);
create index subscription_invoice_lines_invoice_idx on public.subscription_invoice_lines (invoice_id, sort_order);

-- ---------------------------------------------------------------------------
-- Payments (recorded by the superadmin, or submitted by the organization's admin and verified)
-- ---------------------------------------------------------------------------
create table public.subscription_payments (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  invoice_id uuid not null references public.subscription_invoices (id) on delete restrict,
  amount numeric(12, 2) not null constraint subscription_payments_amount_check check (amount > 0),
  paid_on date not null,
  method text not null constraint subscription_payments_method_check check (method in ('jazzcash', 'easypaisa', 'other_wallet', 'bank_transfer', 'cash')),
  reference text constraint subscription_payments_reference_check check (char_length(reference) <= 100),
  payer_name text constraint subscription_payments_payer_check check (char_length(payer_name) <= 120),
  note text constraint subscription_payments_note_check check (char_length(note) <= 500),
  -- subscription-proofs bucket path: <tenant_id>/<file>
  proof_path text constraint subscription_payments_proof_check check (char_length(proof_path) <= 300),
  -- pending: submitted by the organization, waiting for the superadmin
  status text not null default 'verified' constraint subscription_payments_status_check check (status in ('pending', 'verified', 'rejected', 'reversed')),
  -- why it was rejected or reversed (the organization's admin can read a rejection reason)
  reason text constraint subscription_payments_reason_check check (char_length(reason) <= 300),
  submitted_by uuid references auth.users (id) on delete set null,
  verified_by uuid references auth.users (id) on delete set null,
  verified_at timestamptz,
  created_at timestamptz not null default now(),
  constraint subscription_payments_reason_required check (status not in ('rejected', 'reversed') or reason is not null)
);
create index subscription_payments_invoice_idx on public.subscription_payments (invoice_id);
create index subscription_payments_tenant_idx on public.subscription_payments (tenant_id, created_at desc);
create index subscription_payments_pending_idx on public.subscription_payments (created_at) where status = 'pending';

-- ---------------------------------------------------------------------------
-- Events the app turns into emails (reminders, suspension, receipts...). One per kind and day,
-- so re-running the daily job sends nothing twice.
-- ---------------------------------------------------------------------------
create table public.subscription_events (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  invoice_id uuid references public.subscription_invoices (id) on delete cascade,
  payment_id uuid references public.subscription_payments (id) on delete cascade,
  kind text not null constraint subscription_events_kind_check check (kind in (
    'invoice_issued', 'reminder', 'overdue', 'suspended', 'reactivated', 'ended',
    'payment_submitted', 'payment_verified', 'payment_rejected', 'plan_change_requested')),
  for_date date not null default current_date,
  -- reminders: days before the due date
  days integer,
  sent_at timestamptz,
  email_status text,
  created_at timestamptz not null default now()
);
create unique index subscription_events_once_key on public.subscription_events
  (tenant_id, kind, for_date, coalesce(invoice_id, '00000000-0000-0000-0000-000000000000'::uuid), coalesce(payment_id, '00000000-0000-0000-0000-000000000000'::uuid));
create index subscription_events_unsent_idx on public.subscription_events (created_at) where sent_at is null;

-- Every table above is service role only; organizations read their own through my_subscription().
alter table public.subscription_plans enable row level security;
alter table public.tenant_subscriptions enable row level security;
alter table public.tenant_subscription_history enable row level security;
alter table public.subscription_adjustments enable row level security;
alter table public.subscription_invoices enable row level security;
alter table public.subscription_invoice_lines enable row level security;
alter table public.subscription_payments enable row level security;
alter table public.subscription_events enable row level security;
revoke all on public.subscription_plans, public.tenant_subscriptions, public.tenant_subscription_history,
  public.subscription_adjustments, public.subscription_invoices, public.subscription_invoice_lines,
  public.subscription_payments, public.subscription_events from public, anon, authenticated;
grant all on public.subscription_plans, public.tenant_subscriptions, public.tenant_subscription_history,
  public.subscription_adjustments, public.subscription_invoices, public.subscription_invoice_lines,
  public.subscription_payments, public.subscription_events to service_role;
revoke all on sequence public.subscription_invoice_seq from public, anon, authenticated;
grant usage on sequence public.subscription_invoice_seq to service_role;

-- Private bucket for payment screenshots; only the server (service role) reads and writes it.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('subscription-proofs', 'subscription-proofs', false, 5242880, array['image/png', 'image/jpeg', 'image/webp', 'application/pdf'])
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- Prices, limits and modules
-- ---------------------------------------------------------------------------
create or replace function private.plan_price(p_plan public.subscription_plans, p_cycle text)
returns numeric
language sql
immutable
set search_path = ''
as $$
  select case p_cycle when 'yearly' then p_plan.price_yearly else p_plan.price_monthly end;
$$;

-- One period's charge before adjustments: the agreed price (or the plan's current price) less the discount.
create or replace function private.subscription_charge(p_tenant uuid)
returns table (plan_name text, cycle text, subtotal numeric, discount numeric)
language sql
stable
security definer
set search_path = ''
as $$
  with x as (
    select p.name, s.billing_cycle,
           coalesce(s.agreed_price, private.plan_price(p, s.billing_cycle), 0) as price,
           s.discount_type, s.discount_value
    from public.tenant_subscriptions s
    join public.subscription_plans p on p.id = s.plan_id
    where s.tenant_id = p_tenant
  )
  select name, billing_cycle, price,
         round(least(price, case discount_type when 'amount' then discount_value when 'percent' then price * discount_value / 100 else 0 end), 2)
  from x;
$$;

-- Effective limit: the organization's override, else its plan's (null = unlimited, or no subscription).
create or replace function private.tenant_limit(p_tenant uuid, p_kind text)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select case p_kind
           when 'users' then coalesce(s.max_users, p.max_users)
           when 'stores' then coalesce(s.max_stores, p.max_stores)
           when 'products' then coalesce(s.max_products, p.max_products)
         end
  from public.tenant_subscriptions s
  join public.subscription_plans p on p.id = s.plan_id
  where s.tenant_id = p_tenant;
$$;

create or replace function private.tenant_has_module(p_tenant uuid, p_module text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select p_module = any (coalesce(s.allowed_modules, p.allowed_modules)) or coalesce(s.allowed_modules, p.allowed_modules) is null
    from public.tenant_subscriptions s
    join public.subscription_plans p on p.id = s.plan_id
    where s.tenant_id = p_tenant), true);
$$;
revoke all on function private.plan_price(public.subscription_plans, text) from public, anon, authenticated;
revoke all on function private.subscription_charge(uuid) from public, anon, authenticated;
revoke all on function private.tenant_limit(uuid, text) from public, anon;
revoke all on function private.tenant_has_module(uuid, text) from public, anon;
grant execute on function private.tenant_limit(uuid, text) to authenticated, service_role;
grant execute on function private.tenant_has_module(uuid, text) to authenticated, service_role;
grant execute on function private.subscription_charge(uuid) to service_role;
grant execute on function private.plan_price(public.subscription_plans, text) to service_role;

-- Users: refuse a new or reactivated member beyond the limit. Deactivated members and platform
-- superadmins don't count. Nothing is ever deactivated by a downgrade.
create or replace function private.profiles_check_user_limit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_limit integer;
  v_count integer;
begin
  if new.is_superadmin or new.deactivated_at is not null then
    return new;
  end if;
  if tg_op = 'UPDATE' and old.deactivated_at is null and old.tenant_id = new.tenant_id then
    return new;
  end if;
  v_limit := private.tenant_limit(new.tenant_id, 'users');
  if v_limit is null then
    return new;
  end if;
  select count(*) into v_count
  from public.profiles p
  where p.tenant_id = new.tenant_id and p.deactivated_at is null and not p.is_superadmin and p.id <> new.id;
  if v_count >= v_limit then
    raise exception 'This organization''s plan allows % active users.', v_limit
      using errcode = 'P0001', detail = 'plan_limit:users', hint = 'Deactivate a member or ask ProductLogik to change the plan.';
  end if;
  return new;
end;
$$;
create trigger profiles_check_user_limit
  before insert or update of deactivated_at, tenant_id on public.profiles
  for each row execute function private.profiles_check_user_limit();

create or replace function private.inventory_check_product_limit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_limit integer := private.tenant_limit(new.tenant_id, 'products');
  v_count integer;
begin
  if v_limit is null then
    return new;
  end if;
  -- One organization's inserts are counted one at a time (CSV imports insert many rows).
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(new.tenant_id::text || ':products', 0));
  select count(*) into v_count from public.inventory_items i where i.tenant_id = new.tenant_id;
  if v_count >= v_limit then
    raise exception 'This organization''s plan allows % products.', v_limit
      using errcode = 'P0001', detail = 'plan_limit:products', hint = 'Delete unused products or ask ProductLogik to change the plan.';
  end if;
  return new;
end;
$$;
create trigger inventory_check_product_limit
  before insert on public.inventory_items
  for each row execute function private.inventory_check_product_limit();
revoke all on function private.profiles_check_user_limit() from public, anon, authenticated;
revoke all on function private.inventory_check_product_limit() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Every new organization gets a subscription: the sign-up default plan, as a trial or active
-- (Platform settings). The superadmin's Create Organization changes it right after.
-- ---------------------------------------------------------------------------
create or replace function private.tenants_create_subscription()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_settings public.platform_settings;
  v_plan public.subscription_plans;
begin
  select * into v_settings from public.platform_settings;
  select * into v_plan from public.subscription_plans where id = v_settings.default_plan_id and retired_at is null;
  if v_plan.id is null then
    return new;
  end if;
  insert into public.tenant_subscriptions (tenant_id, plan_id, billing_cycle, status, started_at, trial_ends_at, next_due_date, grace_days)
  values (
    new.id, v_plan.id,
    case when v_plan.price_monthly is null then 'yearly' else 'monthly' end,
    case when v_settings.signup_default_status = 'trial' and v_plan.trial_days > 0 then 'trial' else 'active' end,
    current_date,
    case when v_settings.signup_default_status = 'trial' and v_plan.trial_days > 0 then current_date + v_plan.trial_days - 1 end,
    case when v_settings.signup_default_status = 'trial' and v_plan.trial_days > 0 then current_date + v_plan.trial_days else current_date end,
    v_settings.default_grace_days
  );
  return new;
end;
$$;
revoke all on function private.tenants_create_subscription() from public, anon, authenticated;
create trigger tenants_create_subscription
  after insert on public.tenants
  for each row execute function private.tenants_create_subscription();

-- ---------------------------------------------------------------------------
-- Invoices
-- ---------------------------------------------------------------------------
create or replace function private.period_end(p_start date, p_cycle text)
returns date
language sql
immutable
set search_path = ''
as $$
  select (p_start + case p_cycle when 'yearly' then interval '1 year' else interval '1 month' end - interval '1 day')::date;
$$;

-- Creates the invoice for the period starting p_period_start (applying a waiting plan change and
-- every pending adjustment). Returns the existing one if that period is already billed.
create or replace function public.admin_create_subscription_invoice(p_tenant uuid, p_period_start date, p_issue_date date, p_by uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_sub public.tenant_subscriptions;
  v_existing uuid;
  v_charge record;
  v_adjust numeric;
  v_invoice uuid;
  v_end date;
  v_line integer := 0;
  v_adj record;
begin
  select id into v_existing from public.subscription_invoices
  where tenant_id = p_tenant and period_start = p_period_start and status <> 'void';
  if v_existing is not null then
    return v_existing;
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_tenant::text || ':subscription', 0));
  select * into v_sub from public.tenant_subscriptions where tenant_id = p_tenant for update;
  if v_sub.tenant_id is null then
    raise exception 'This organization has no subscription.' using errcode = 'P0002';
  end if;
  -- A plan change chosen "from the next period" takes effect with this invoice.
  if v_sub.pending_plan_id is not null or v_sub.pending_billing_cycle is not null then
    update public.tenant_subscriptions
    set plan_id = coalesce(pending_plan_id, plan_id),
        billing_cycle = coalesce(pending_billing_cycle, billing_cycle),
        pending_plan_id = null, pending_billing_cycle = null,
        updated_by = p_by, change_reason = 'Plan change applied at the new period', updated_at = now()
    where tenant_id = p_tenant
    returning * into v_sub;
  end if;

  select * into v_charge from private.subscription_charge(p_tenant);
  select coalesce(sum(amount), 0) into v_adjust from public.subscription_adjustments where tenant_id = p_tenant and invoice_id is null;
  v_end := private.period_end(p_period_start, v_sub.billing_cycle);

  insert into public.subscription_invoices (
    tenant_id, number, plan_id, plan_name, billing_cycle, period_start, period_end, issue_date, due_date,
    subtotal, discount, adjustments, total, status, created_by)
  values (
    p_tenant,
    'PLS-' || to_char(p_issue_date, 'YYYY') || '-' || lpad(nextval('public.subscription_invoice_seq')::text, 4, '0'),
    v_sub.plan_id, v_charge.plan_name, v_sub.billing_cycle, p_period_start, v_end, p_issue_date, p_period_start,
    v_charge.subtotal, v_charge.discount, v_adjust, greatest(v_charge.subtotal - v_charge.discount + v_adjust, 0),
    case when v_charge.subtotal - v_charge.discount + v_adjust <= 0 then 'paid' else 'unpaid' end,
    p_by)
  returning id into v_invoice;

  insert into public.subscription_invoice_lines (invoice_id, kind, description, amount, sort_order)
  values (v_invoice, 'plan',
          v_charge.plan_name || ' plan, ' || v_sub.billing_cycle || ' (' || to_char(p_period_start, 'DD Mon YYYY') || ' to ' || to_char(v_end, 'DD Mon YYYY') || ')',
          v_charge.subtotal, 0);
  if v_charge.discount > 0 then
    insert into public.subscription_invoice_lines (invoice_id, kind, description, amount, sort_order)
    values (v_invoice, 'discount', coalesce(nullif(v_sub.price_note, ''), 'Discount'), -v_charge.discount, 1);
  end if;
  for v_adj in select * from public.subscription_adjustments where tenant_id = p_tenant and invoice_id is null order by created_at loop
    v_line := v_line + 1;
    insert into public.subscription_invoice_lines (invoice_id, kind, description, amount, sort_order)
    values (v_invoice, 'adjustment', v_adj.description, v_adj.amount, 1 + v_line);
  end loop;
  update public.subscription_adjustments set invoice_id = v_invoice where tenant_id = p_tenant and invoice_id is null;

  insert into public.subscription_events (tenant_id, invoice_id, kind, for_date)
  values (p_tenant, v_invoice, 'invoice_issued', p_issue_date)
  on conflict do nothing;

  -- A zero invoice (e.g. fully credited) counts as paid at once.
  perform private.refresh_subscription(p_tenant, p_issue_date);
  return v_invoice;
end;
$$;

-- ---------------------------------------------------------------------------
-- Payment → invoice → subscription
-- ---------------------------------------------------------------------------
-- Recomputes paid_until from the paid invoices and, when the organization is covered again,
-- reactivates it (a subscription-unpaid suspension only; a manual suspension stays).
create or replace function private.refresh_subscription(p_tenant uuid, p_date date)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_sub public.tenant_subscriptions;
  v_paid_until date;
begin
  select * into v_sub from public.tenant_subscriptions where tenant_id = p_tenant;
  if v_sub.tenant_id is null then
    return;
  end if;
  select max(period_end) into v_paid_until from public.subscription_invoices where tenant_id = p_tenant and status = 'paid';
  if v_paid_until is distinct from v_sub.paid_until then
    update public.tenant_subscriptions
    set paid_until = v_paid_until,
        next_due_date = case when v_paid_until is not null then v_paid_until + 1 else next_due_date end,
        updated_at = now(), updated_by = null, change_reason = 'Payment recorded'
    where tenant_id = p_tenant
    returning * into v_sub;
  end if;
  -- Covered today (paid, or still in the trial)?
  if (v_sub.paid_until >= p_date or v_sub.trial_ends_at >= p_date) and v_sub.status in ('past_due', 'suspended') then
    update public.tenant_subscriptions
    set status = case when v_sub.paid_until >= p_date then 'active' else 'trial' end,
        updated_at = now(), updated_by = null, change_reason = 'Covered again'
    where tenant_id = p_tenant;
    if v_sub.status = 'suspended' then
      update public.tenants set status = 'active', status_reason = null, updated_at = now()
      where id = p_tenant and status = 'suspended' and status_reason = 'Subscription unpaid';
      insert into public.subscription_events (tenant_id, kind, for_date) values (p_tenant, 'reactivated', p_date) on conflict do nothing;
    end if;
  elsif v_sub.status = 'trial' and v_sub.paid_until >= p_date then
    update public.tenant_subscriptions set status = 'active', updated_at = now(), updated_by = null, change_reason = 'Payment recorded'
    where tenant_id = p_tenant;
  end if;
end;
$$;

create or replace function private.sync_subscription_invoice(p_invoice uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_paid numeric;
  v_inv public.subscription_invoices;
begin
  select * into v_inv from public.subscription_invoices where id = p_invoice;
  if v_inv.id is null or v_inv.status = 'void' then
    return;
  end if;
  select coalesce(sum(amount), 0) into v_paid from public.subscription_payments where invoice_id = p_invoice and status = 'verified';
  update public.subscription_invoices
  set amount_paid = v_paid,
      status = case when v_paid >= total then 'paid' when v_paid > 0 then 'partly_paid' else 'unpaid' end
  where id = p_invoice;
  perform private.refresh_subscription(v_inv.tenant_id, current_date);
end;
$$;

create or replace function private.subscription_payments_sync()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.sync_subscription_invoice(coalesce(new.invoice_id, old.invoice_id));
  if tg_op = 'UPDATE' and old.invoice_id <> new.invoice_id then
    perform private.sync_subscription_invoice(old.invoice_id);
  end if;
  return null;
end;
$$;
create trigger subscription_payments_sync
  after insert or update or delete on public.subscription_payments
  for each row execute function private.subscription_payments_sync();

revoke all on function private.period_end(date, text) from public, anon, authenticated;
revoke all on function private.refresh_subscription(uuid, date) from public, anon, authenticated;
revoke all on function private.sync_subscription_invoice(uuid) from public, anon, authenticated;
revoke all on function private.subscription_payments_sync() from public, anon, authenticated;
revoke all on function private.tenant_subscriptions_history() from public, anon, authenticated;
revoke all on function public.admin_create_subscription_invoice(uuid, date, date, uuid) from public, anon, authenticated;
grant execute on function public.admin_create_subscription_invoice(uuid, date, date, uuid) to service_role;
grant execute on function private.refresh_subscription(uuid, date) to service_role;
grant execute on function private.period_end(date, text) to service_role;

-- ---------------------------------------------------------------------------
-- The daily run (also "Run now" in /admin/billing). Idempotent for a date.
-- ---------------------------------------------------------------------------
create or replace function public.run_subscription_cycle(p_date date)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_settings public.platform_settings;
  v_sub record;
  v_charge record;
  v_cover date;
  v_next date;
  v_invoice uuid;
  v_open boolean;
  v_status text;
  v_issued integer := 0;
  v_suspended integer := 0;
  v_reminders integer := 0;
  v_ended integer := 0;
begin
  select * into v_settings from public.platform_settings;

  for v_sub in
    select s.* from public.tenant_subscriptions s
    join public.tenants t on t.id = s.tenant_id
    where t.archived_at is null and s.status <> 'cancelled'
  loop
    select * into v_charge from private.subscription_charge(v_sub.tenant_id);
    v_cover := coalesce(greatest(v_sub.paid_until, v_sub.trial_ends_at), v_sub.started_at - 1);
    v_next := v_cover + 1;

    -- Cancelled: no more invoices; ends once the covered period is over.
    if v_sub.cancel_at is not null and v_next > v_sub.cancel_at then
      if p_date > v_cover then
        update public.tenant_subscriptions set status = 'cancelled', next_due_date = null, updated_at = now(), updated_by = null, change_reason = 'Subscription ended'
        where tenant_id = v_sub.tenant_id;
        update public.tenants set status = 'suspended', status_reason = 'Subscription ended', updated_at = now() where id = v_sub.tenant_id;
        insert into public.subscription_events (tenant_id, kind, for_date) values (v_sub.tenant_id, 'ended', p_date) on conflict do nothing;
        v_ended := v_ended + 1;
      end if;
      continue;
    end if;

    -- Free plan (e.g. Founding) with nothing pending: always active, never invoiced.
    if coalesce(v_charge.subtotal - v_charge.discount, 0) <= 0
       and not exists (select 1 from public.subscription_adjustments a where a.tenant_id = v_sub.tenant_id and a.invoice_id is null and a.amount > 0) then
      v_status := case when v_sub.trial_ends_at >= p_date then 'trial' else 'active' end;
      if v_sub.status is distinct from v_status or v_sub.next_due_date is not null then
        update public.tenant_subscriptions set status = v_status, next_due_date = null, updated_at = now(), updated_by = null, change_reason = 'Free plan'
        where tenant_id = v_sub.tenant_id;
      end if;
      continue;
    end if;

    -- Issue the next period's invoice once it is within the lead days.
    if p_date >= v_next - v_settings.invoice_lead_days then
      if not exists (select 1 from public.subscription_invoices i where i.tenant_id = v_sub.tenant_id and i.period_start = v_next and i.status <> 'void') then
        perform public.admin_create_subscription_invoice(v_sub.tenant_id, v_next, p_date, null);
        v_issued := v_issued + 1;
        -- A zero invoice may already have moved paid_until on.
        select coalesce(greatest(s.paid_until, s.trial_ends_at), s.started_at - 1) into v_cover from public.tenant_subscriptions s where s.tenant_id = v_sub.tenant_id;
        v_next := v_cover + 1;
      end if;
    end if;

    select i.id into v_invoice from public.subscription_invoices i
    where i.tenant_id = v_sub.tenant_id and i.period_start = v_next and i.status in ('unpaid', 'partly_paid');
    v_open := v_invoice is not null;

    -- Reminders 7 / 3 / 0 days before the due date (platform setting).
    if v_open and (v_next - p_date) = any (v_settings.reminder_days) then
      insert into public.subscription_events (tenant_id, invoice_id, kind, for_date, days)
      values (v_sub.tenant_id, v_invoice, 'reminder', p_date, v_next - p_date)
      on conflict do nothing;
      if found then v_reminders := v_reminders + 1; end if;
    end if;

    if p_date <= v_next then
      -- Covered (or the due date itself).
      v_status := case when v_sub.trial_ends_at >= p_date and coalesce(v_sub.paid_until, v_sub.started_at - 1) < p_date then 'trial'
                       when v_sub.status = 'suspended' then 'suspended'
                       else 'active' end;
      if v_sub.status = 'past_due' then v_status := 'active'; end if;
    elsif p_date <= v_next + v_sub.grace_days or not v_sub.auto_suspend then
      v_status := 'past_due';
      if v_sub.status <> 'past_due' then
        insert into public.subscription_events (tenant_id, invoice_id, kind, for_date) values (v_sub.tenant_id, v_invoice, 'overdue', p_date) on conflict do nothing;
      end if;
    else
      v_status := 'suspended';
      if v_sub.status <> 'suspended' then
        update public.tenants set status = 'suspended', status_reason = 'Subscription unpaid', updated_at = now()
        where id = v_sub.tenant_id and status <> 'suspended';
        insert into public.subscription_events (tenant_id, invoice_id, kind, for_date) values (v_sub.tenant_id, v_invoice, 'suspended', p_date) on conflict do nothing;
        v_suspended := v_suspended + 1;
      end if;
    end if;

    if v_sub.status is distinct from v_status or v_sub.next_due_date is distinct from v_next then
      update public.tenant_subscriptions set status = v_status, next_due_date = v_next, updated_at = now(), updated_by = null, change_reason = 'Daily run'
      where tenant_id = v_sub.tenant_id;
    end if;
  end loop;

  perform public.admin_refresh_health(p_date);

  return jsonb_build_object('date', p_date, 'invoicesIssued', v_issued, 'reminders', v_reminders, 'suspended', v_suspended, 'ended', v_ended);
end;
$$;
revoke all on function public.run_subscription_cycle(date) from public, anon, authenticated;
grant execute on function public.run_subscription_cycle(date) to service_role;

-- ---------------------------------------------------------------------------
-- The organization's own view (works while it is suspended for non-payment, so its admins can pay)
-- ---------------------------------------------------------------------------
-- The caller's organization if they are one of its active admins (or a superadmin acting as it).
create or replace function private.my_billing_tenant()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    private.impersonated_tenant_id(),
    (select p.tenant_id from public.profiles p join public.tenants t on t.id = p.tenant_id
     where p.id = auth.uid() and p.role = 'admin' and p.deactivated_at is null and t.archived_at is null)
  );
$$;
revoke all on function private.my_billing_tenant() from public, anon;
grant execute on function private.my_billing_tenant() to authenticated, service_role;

create or replace function public.my_subscription()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with t as (select private.my_billing_tenant() as id)
  select case when t.id is null then null else jsonb_build_object(
    'tenant', (select jsonb_build_object('id', tn.id, 'name', tn.name, 'status', tn.status, 'statusReason', tn.status_reason) from public.tenants tn where tn.id = t.id),
    'subscription', (
      select jsonb_build_object(
        'plan', p.name, 'planDescription', p.description, 'cycle', s.billing_cycle, 'status', s.status,
        'trialEndsAt', s.trial_ends_at, 'paidUntil', s.paid_until, 'nextDueDate', s.next_due_date, 'graceDays', s.grace_days,
        'cancelAt', s.cancel_at,
        'price', c.subtotal - c.discount,
        'limits', jsonb_build_object(
          'users', private.tenant_limit(t.id, 'users'),
          'stores', private.tenant_limit(t.id, 'stores'),
          'products', private.tenant_limit(t.id, 'products')),
        'usage', jsonb_build_object(
          'users', (select count(*) from public.profiles x where x.tenant_id = t.id and x.deactivated_at is null and not x.is_superadmin),
          'stores', 1,
          'products', (select count(*) from public.inventory_items x where x.tenant_id = t.id)))
      from public.tenant_subscriptions s
      join public.subscription_plans p on p.id = s.plan_id
      cross join lateral private.subscription_charge(t.id) c
      where s.tenant_id = t.id),
    'invoices', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', i.id, 'number', i.number, 'periodStart', i.period_start, 'periodEnd', i.period_end, 'dueDate', i.due_date,
        'total', i.total, 'amountPaid', i.amount_paid, 'status', i.status) order by i.period_start desc)
      from public.subscription_invoices i where i.tenant_id = t.id and i.status <> 'void'), '[]'::jsonb),
    'payments', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', sp.id, 'invoiceId', sp.invoice_id, 'amount', sp.amount, 'paidOn', sp.paid_on, 'method', sp.method,
        'reference', sp.reference, 'status', sp.status, 'reason', case when sp.status = 'rejected' then sp.reason end,
        'createdAt', sp.created_at) order by sp.created_at desc)
      from public.subscription_payments sp where sp.tenant_id = t.id), '[]'::jsonb),
    'payTo', (select jsonb_build_object('businessName', ps.business_name, 'wallets', ps.payment_wallets, 'banks', ps.payment_banks, 'note', ps.payment_note)
              from public.platform_settings ps)
  ) end
  from t;
$$;
revoke all on function public.my_subscription() from public, anon;
grant execute on function public.my_subscription() to authenticated;

-- "I've paid": the organization's admin reports a payment (a screenshot, if any, is already in the
-- subscription-proofs bucket under the organization's folder). It waits as pending for the superadmin.
create or replace function public.submit_subscription_payment(
  p_invoice_id uuid, p_amount numeric, p_paid_on date, p_method text, p_reference text, p_payer_name text, p_note text, p_proof_path text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tenant uuid := private.my_billing_tenant();
  v_inv public.subscription_invoices;
  v_id uuid;
begin
  if v_tenant is null then
    raise exception 'Only the organization''s admins can report a payment.' using errcode = '42501';
  end if;
  select * into v_inv from public.subscription_invoices where id = p_invoice_id and tenant_id = v_tenant;
  if v_inv.id is null or v_inv.status not in ('unpaid', 'partly_paid') then
    raise exception 'That invoice isn''t open.' using errcode = '22023';
  end if;
  if p_amount is null or p_amount <= 0 or p_amount > v_inv.total - v_inv.amount_paid + 0.005 then
    raise exception 'Enter an amount up to the amount due.' using errcode = '22023';
  end if;
  if p_paid_on is null or p_paid_on > current_date + 1 or p_paid_on < current_date - 180 then
    raise exception 'Enter the date you paid.' using errcode = '22023';
  end if;
  if nullif(trim(p_reference), '') is null then
    raise exception 'Enter the transaction ID.' using errcode = '22023';
  end if;
  if p_proof_path is not null and p_proof_path not like v_tenant::text || '/%' then
    raise exception 'That screenshot upload isn''t valid.' using errcode = '22023';
  end if;
  if (select count(*) from public.subscription_payments where tenant_id = v_tenant and status = 'pending') >= 5 then
    raise exception 'You already have payments waiting to be checked.' using errcode = '22023';
  end if;
  insert into public.subscription_payments (tenant_id, invoice_id, amount, paid_on, method, reference, payer_name, note, proof_path, status, submitted_by)
  values (v_tenant, p_invoice_id, round(p_amount, 2), p_paid_on, p_method, trim(p_reference), nullif(trim(p_payer_name), ''), nullif(trim(p_note), ''), p_proof_path, 'pending', auth.uid())
  returning id into v_id;
  insert into public.subscription_events (tenant_id, invoice_id, payment_id, kind) values (v_tenant, p_invoice_id, v_id, 'payment_submitted');
  return v_id;
end;
$$;
revoke all on function public.submit_subscription_payment(uuid, numeric, date, text, text, text, text, text) from public, anon;
grant execute on function public.submit_subscription_payment(uuid, numeric, date, text, text, text, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Email templates for the new emails
-- ---------------------------------------------------------------------------
alter table public.email_logs drop constraint email_logs_template_check;
alter table public.email_logs add constraint email_logs_template_check check (template in (
  'welcome', 'password_reset', 'staff_invite', 'document_share', 'payment_receipt',
  'subscription_invoice', 'subscription_reminder', 'subscription_receipt', 'subscription_notice', 'superadmin_notice'));

-- ---------------------------------------------------------------------------
-- Seed: the three starting plans, the Founding plan for existing organizations
-- ---------------------------------------------------------------------------
insert into public.subscription_plans (name, code, description, visibility, price_monthly, price_yearly, max_stores, max_users, max_products, trial_days, sort_order) values
  ('Starter', 'starter', 'For a single shop getting started.', 'standard', 1200, 12000, 1, 3, 1000, 14, 10),
  ('Business', 'business', 'For growing businesses with a few stores.', 'standard', 1800, 18000, 3, 10, 10000, 14, 20),
  ('Enterprise', 'enterprise', 'For larger businesses with many stores and users.', 'standard', 2600, 26000, 10, 30, null, 14, 30),
  ('Founding', 'founding', 'Organizations that joined before subscriptions. Free, no limits.', 'custom', 0, 0, null, null, null, 0, 90);

update public.platform_settings set default_plan_id = (select id from public.subscription_plans where code = 'starter') where true;

insert into public.tenant_subscriptions (tenant_id, plan_id, billing_cycle, status, started_at, next_due_date, change_reason)
select t.id, (select id from public.subscription_plans where code = 'founding'), 'monthly', 'active', current_date, null, 'Existing organization moved to the Founding plan'
from public.tenants t
where not exists (select 1 from public.tenant_subscriptions s where s.tenant_id = t.id);
