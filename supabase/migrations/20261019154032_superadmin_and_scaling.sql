-- Phase 12: superadmin flag + audit log, email log, and the shop columns Phases 13–14 build on
-- (status, document number prefixes / "start from" floors, bank details, invoice terms).

-- ---------------------------------------------------------------------------
-- Superadmin
-- ---------------------------------------------------------------------------
-- Platform operators (Phase 13 /admin). Set only from the database / service role:
-- authenticated has column-level UPDATE on profiles (full_name, dashboard_prefs, updated_at) only.
alter table public.profiles add column is_superadmin boolean not null default false;
create index profiles_superadmin_idx on public.profiles (id) where is_superadmin;

-- Everything a superadmin does to a shop or user (Phase 13), written by the server with the service role.
create table public.superadmin_audit_logs (
  id uuid primary key default gen_random_uuid(),
  admin_id uuid references auth.users (id) on delete set null,
  target_tenant_id uuid references public.tenants (id) on delete set null,
  target_user_id uuid references auth.users (id) on delete set null,
  action text not null,
  -- e.g. { "before": {...}, "after": {...} }
  details jsonb not null default '{}'::jsonb,
  ip_address inet,
  created_at timestamptz not null default now()
);
create index superadmin_audit_logs_created_idx on public.superadmin_audit_logs (created_at desc);
create index superadmin_audit_logs_tenant_idx on public.superadmin_audit_logs (target_tenant_id, created_at desc);
alter table public.superadmin_audit_logs enable row level security;
-- No policies and no grants: only the service role reads or writes it.
revoke all on public.superadmin_audit_logs from public, anon, authenticated;
grant all on public.superadmin_audit_logs to service_role;

-- ---------------------------------------------------------------------------
-- Email log
-- ---------------------------------------------------------------------------
-- One row per transactional email (src/lib/email/send.ts), written with the service role so a
-- shop can't add or edit entries. tenant_id is null for platform emails (e.g. a superadmin reset).
create table public.email_logs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references public.tenants (id) on delete cascade,
  sent_by uuid references auth.users (id) on delete set null,
  recipient text not null,
  template text not null
    constraint email_logs_template_check
    check (template in ('welcome', 'password_reset', 'staff_invite', 'document_share', 'payment_receipt')),
  subject text not null,
  resend_id text,
  -- sent: accepted by Resend; logged: no RESEND_API_KEY, printed to the server console; failed: see error
  status text not null constraint email_logs_status_check check (status in ('sent', 'logged', 'failed')),
  error text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index email_logs_tenant_created_idx on public.email_logs (tenant_id, created_at desc);
alter table public.email_logs enable row level security;
revoke all on public.email_logs from public, anon, authenticated;
grant select on public.email_logs to authenticated;
grant all on public.email_logs to service_role;
create policy "Admins view their shop's email log" on public.email_logs
  for select to authenticated
  using (
    tenant_id = private.current_tenant_id()
    and exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
  );

-- ---------------------------------------------------------------------------
-- Shop columns
-- ---------------------------------------------------------------------------
alter table public.tenants
  -- Set by superadmins (Phase 13); suspended shops can't sign in. Not writable by shops.
  add column status text not null default 'active'
    constraint tenants_status_check check (status in ('active', 'suspended', 'trial')),
  -- Document numbers: <prefix>-<number>. Prefixes are capitals/digits, optionally hyphenated (e.g. "HAA-INV").
  add column invoice_prefix text not null default 'INV',
  add column quote_prefix text not null default 'Q',
  add column draft_prefix text not null default 'D',
  -- "Start from": the lowest number the next document may get (a floor, not a counter).
  add column invoice_start_number integer not null default 1001,
  add column quote_start_number integer not null default 1001,
  add column draft_start_number integer not null default 1001,
  add column bank_name text,
  add column bank_account_title text,
  add column bank_account_number text,
  add column bank_iban text,
  add column bank_raast_id text,
  -- Mobile wallets: [{ "provider": "JazzCash" | "EasyPaisa" | ..., "number": "03..." }]
  add column bank_wallets jsonb not null default '[]'::jsonb,
  -- Payment terms printed on invoices (quotations keep quote_footer_notes).
  add column invoice_terms text;

alter table public.tenants
  add constraint tenants_document_prefixes_check check (
    invoice_prefix ~ '^[A-Z0-9]+(-[A-Z0-9]+)*$' and char_length(invoice_prefix) <= 10
    and quote_prefix ~ '^[A-Z0-9]+(-[A-Z0-9]+)*$' and char_length(quote_prefix) <= 10
    and draft_prefix ~ '^[A-Z0-9]+(-[A-Z0-9]+)*$' and char_length(draft_prefix) <= 10
  ),
  add constraint tenants_document_start_numbers_check check (
    invoice_start_number between 1 and 99999999
    and quote_start_number between 1 and 99999999
    and draft_start_number between 1 and 99999999
  ),
  add constraint tenants_bank_wallets_check check (jsonb_typeof(bank_wallets) = 'array'),
  add constraint tenants_bank_text_lengths_check check (
    char_length(coalesce(bank_name, '')) <= 120
    and char_length(coalesce(bank_account_title, '')) <= 120
    and char_length(coalesce(bank_account_number, '')) <= 40
    and char_length(coalesce(bank_iban, '')) <= 34
    and char_length(coalesce(bank_raast_id, '')) <= 40
    and char_length(coalesce(invoice_terms, '')) <= 2000
  );

-- Shop admins edit these in Phase 14 (the "Admins can update their own tenant" policy applies).
-- status is deliberately left out.
grant update (
  invoice_prefix, quote_prefix, draft_prefix,
  invoice_start_number, quote_start_number, draft_start_number,
  bank_name, bank_account_title, bank_account_number, bank_iban, bank_raast_id, bank_wallets,
  invoice_terms
) on public.tenants to authenticated;

-- ---------------------------------------------------------------------------
-- Document numbers (Phase 5) with the shop's prefix and "start from" floor
-- ---------------------------------------------------------------------------
-- p_prefix still names the series ('D', 'Q', 'INV'), so save_quote / convert_quote are unchanged.
-- Next = greatest(highest number used in the series, start − 1) + 1, still derived from the
-- shop's existing documents: whatever the prefix was when they were numbered, the digits continue.
create or replace function public.next_document_number(p_prefix text)
returns text
language plpgsql
set search_path = ''
as $$
declare
  v_tenant_id uuid := public.current_tenant_id();
  v_last integer;
  v_shop_prefix text;
  v_start integer;
begin
  if v_tenant_id is null then
    raise exception 'Not authenticated.' using errcode = '42501';
  end if;
  if p_prefix is null or p_prefix not in ('D', 'Q', 'INV') then
    raise exception 'Unknown number series %.', p_prefix using errcode = '22023';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_tenant_id::text || ':' || p_prefix, 0));

  select case p_prefix when 'D' then t.draft_prefix when 'Q' then t.quote_prefix else t.invoice_prefix end,
         case p_prefix when 'D' then t.draft_start_number when 'Q' then t.quote_start_number else t.invoice_start_number end
    into v_shop_prefix, v_start
  from public.tenants t
  where t.id = v_tenant_id;

  select max(substring(n from '[0-9]+$')::integer) into v_last
  from (
    select case p_prefix
             when 'D' then q.draft_number
             when 'Q' then q.quotation_number
             else q.invoice_number
           end as n
    from public.quotes q
    where q.tenant_id = v_tenant_id
  ) numbers
  where n is not null;

  return coalesce(v_shop_prefix, p_prefix) || '-' || (greatest(coalesce(v_last, 0), coalesce(v_start, 1001) - 1) + 1);
end;
$$;
