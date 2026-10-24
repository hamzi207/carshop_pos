-- Phase 18 (RF-18.3) fix: every organization gets its "Walk-in / Cash Customer" at creation, so the
-- "Add your first customer" step was ticked from day one. Only real customers count now.
create or replace function private.onboarding_status(p_tenant uuid)
returns table(step text, done boolean, step_order integer)
language sql
stable security definer
set search_path to ''
as $function$
  select s.step,
    case s.step
      when 'profile' then nullif(btrim(t.address), '') is not null and nullif(btrim(t.phone), '') is not null
      when 'logo' then t.logo_url is not null
      when 'payment_details' then coalesce(nullif(btrim(t.bank_account_number), ''), nullif(btrim(t.bank_iban), ''),
                                           nullif(btrim(t.bank_raast_id), '')) is not null
                                  or jsonb_array_length(case when jsonb_typeof(t.bank_wallets) = 'array' then t.bank_wallets else '[]' end) > 0
      when 'products' then exists (select 1 from public.inventory_items i where i.tenant_id = t.id)
      when 'opening_stock' then exists (select 1 from public.inventory_items i where i.tenant_id = t.id and i.quantity_on_hand > 0)
      when 'customer' then exists (select 1 from public.customers c where c.tenant_id = t.id and not c.is_walk_in)
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
$function$;
