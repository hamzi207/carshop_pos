-- Phase 14: team members (deactivate), document numbering preview, bank wallet limits.

-- ---------------------------------------------------------------------------
-- Team: deactivated members
-- ---------------------------------------------------------------------------
-- Set by a shop admin (Settings → Team). The auth user is also banned, so they can't sign in;
-- this column cuts off a session that is still open at once (current_tenant_id returns null).
alter table public.profiles add column deactivated_at timestamptz;

create or replace function private.current_tenant_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    private.impersonated_tenant_id(),
    (select p.tenant_id
     from public.profiles p
     join public.tenants t on t.id = p.tenant_id
     where p.id = auth.uid() and t.status <> 'suspended' and p.deactivated_at is null)
  );
$$;

create or replace function private.is_shop_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.impersonated_tenant_id() is not null
    or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin' and p.deactivated_at is null);
$$;

-- Login / session check: 'deactivated' for a deactivated member, else the shop's status.
create or replace function public.my_shop_status()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select case when p.deactivated_at is not null then 'deactivated' else t.status end
  from public.profiles p
  join public.tenants t on t.id = p.tenant_id
  where p.id = auth.uid();
$$;

-- ---------------------------------------------------------------------------
-- Document numbering (Settings → Documents)
-- ---------------------------------------------------------------------------
-- The highest number already used in each series by the caller's shop, so the settings page can
-- preview "next number" for any prefix / start-from the admin types (next = greatest(highest, start − 1) + 1,
-- the same rule as next_document_number).
create or replace function public.document_number_floors()
returns jsonb
language sql
stable
set search_path = ''
as $$
  select jsonb_build_object(
    'draft', coalesce(max(substring(q.draft_number from '[0-9]+$')::integer), 0),
    'quote', coalesce(max(substring(q.quotation_number from '[0-9]+$')::integer), 0),
    'invoice', coalesce(max(substring(q.invoice_number from '[0-9]+$')::integer), 0)
  )
  from public.quotes q
  where q.tenant_id = public.current_tenant_id();
$$;
revoke all on function public.document_number_floors() from public, anon;
grant execute on function public.document_number_floors() to authenticated;

-- ---------------------------------------------------------------------------
-- Bank details: at most 5 mobile wallets, each { provider, number, title? }
-- ---------------------------------------------------------------------------
alter table public.tenants
  add constraint tenants_bank_wallets_size_check check (jsonb_array_length(bank_wallets) <= 5);
