-- Phase 17 (deliverable 9): no part payments. A payment covers an invoice's full amount due, whether
-- the superadmin records it or the organization's admin reports it ("I've paid"). A downgrade is
-- billed at the lower plan's price instead (the console reissues the open invoice).

-- A payment that becomes verified must match the amount still due on an open invoice.
create or replace function private.subscription_payments_full_amount()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_inv public.subscription_invoices;
begin
  if new.status <> 'verified' or (tg_op = 'UPDATE' and old.status = 'verified') then
    return new;
  end if;
  select * into v_inv from public.subscription_invoices where id = new.invoice_id;
  if v_inv.id is null or v_inv.status not in ('unpaid', 'partly_paid') then
    raise exception 'Invoice % isn''t open.', coalesce(v_inv.number, '') using errcode = '22023';
  end if;
  if abs(new.amount - (v_inv.total - v_inv.amount_paid)) > 0.005 then
    raise exception 'A payment must cover the full amount due on % (PKR %).', v_inv.number, v_inv.total - v_inv.amount_paid
      using errcode = '22023';
  end if;
  return new;
end;
$$;
revoke all on function private.subscription_payments_full_amount() from public, anon, authenticated;
create trigger subscription_payments_full_amount
  before insert or update of status, amount on public.subscription_payments
  for each row execute function private.subscription_payments_full_amount();

-- "I've paid": the full amount due only, and one report per invoice at a time.
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
  if p_amount is null or abs(p_amount - (v_inv.total - v_inv.amount_paid)) > 0.005 then
    raise exception 'Pay the full amount due (PKR %).', v_inv.total - v_inv.amount_paid using errcode = '22023';
  end if;
  if exists (select 1 from public.subscription_payments where invoice_id = p_invoice_id and status = 'pending') then
    raise exception 'A payment for this invoice is already being checked.' using errcode = '22023';
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
  insert into public.subscription_payments (tenant_id, invoice_id, amount, paid_on, method, reference, payer_name, note, proof_path, status, submitted_by)
  values (v_tenant, p_invoice_id, round(p_amount, 2), p_paid_on, p_method, trim(p_reference), nullif(trim(p_payer_name), ''), nullif(trim(p_note), ''), p_proof_path, 'pending', auth.uid())
  returning id into v_id;
  insert into public.subscription_events (tenant_id, invoice_id, payment_id, kind) values (v_tenant, p_invoice_id, v_id, 'payment_submitted');
  return v_id;
end;
$$;
revoke all on function public.submit_subscription_payment(uuid, numeric, date, text, text, text, text, text) from public, anon;
grant execute on function public.submit_subscription_payment(uuid, numeric, date, text, text, text, text, text) to authenticated;
