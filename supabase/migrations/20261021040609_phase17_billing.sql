-- Phase 17 (deliverable 9): an organization suspended for an unpaid (or ended) subscription isn't
-- signed out like a manual suspension: its users see what is due and its admins can report a payment.

-- Login / session check: 'archived', 'deactivated', 'unpaid' (suspended by the subscription run),
-- or the organization's status.
create or replace function public.my_shop_status()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select case
           when t.archived_at is not null then 'archived'
           when p.deactivated_at is not null then 'deactivated'
           when t.status = 'suspended' and t.status_reason in ('Subscription unpaid', 'Subscription ended') then 'unpaid'
           else t.status
         end
  from public.profiles p
  join public.tenants t on t.id = p.tenant_id
  where p.id = auth.uid();
$$;

-- What a suspended organization's staff see: the reason and the amount due, no invoice details.
create or replace function public.my_unpaid_notice()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'tenantName', t.name,
    'reason', t.status_reason,
    'isAdmin', p.role = 'admin',
    'amountDue', (select coalesce(sum(i.total - i.amount_paid), 0) from public.subscription_invoices i
                  where i.tenant_id = t.id and i.status in ('unpaid', 'partly_paid')))
  from public.profiles p
  join public.tenants t on t.id = p.tenant_id
  where p.id = auth.uid() and p.deactivated_at is null and t.archived_at is null;
$$;
revoke all on function public.my_unpaid_notice() from public, anon;
grant execute on function public.my_unpaid_notice() to authenticated;

-- One of the organization's invoices with its lines (its PDF on /settings/subscription).
create or replace function public.my_subscription_invoice(p_invoice uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'invoice', to_jsonb(i) - 'created_by' - 'void_reason' - 'emailed_at',
    'lines', coalesce((select jsonb_agg(jsonb_build_object('kind', l.kind, 'description', l.description, 'amount', l.amount) order by l.sort_order)
                       from public.subscription_invoice_lines l where l.invoice_id = i.id), '[]'::jsonb),
    'tenant', (select jsonb_build_object('name', t.name, 'address', t.address, 'phone', t.phone, 'email', t.email, 'ntn', t.ntn)
               from public.tenants t where t.id = i.tenant_id))
  from public.subscription_invoices i
  where i.id = p_invoice and i.tenant_id = private.my_billing_tenant() and i.status <> 'void';
$$;
revoke all on function public.my_subscription_invoice(uuid) from public, anon;
grant execute on function public.my_subscription_invoice(uuid) to authenticated;
