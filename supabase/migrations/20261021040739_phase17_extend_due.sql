-- Phase 17 (deliverable 9): the superadmin can extend an organization's due date by hand (with a
-- reason). Until then it isn't past due and gets no overdue notice; the invoice and period stay the same.

alter table public.tenant_subscriptions
  add column extended_until date;

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
  -- The due date after any hand extension.
  v_due date;
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
    v_due := greatest(v_next, coalesce(v_sub.extended_until, v_next));

    -- Reminders 7 / 3 / 0 days before the due date (platform setting).
    if v_open and (v_due - p_date) = any (v_settings.reminder_days) then
      insert into public.subscription_events (tenant_id, invoice_id, kind, for_date, days)
      values (v_sub.tenant_id, v_invoice, 'reminder', p_date, v_due - p_date)
      on conflict do nothing;
      if found then v_reminders := v_reminders + 1; end if;
    end if;

    if p_date <= v_due then
      -- Covered (or the due date itself).
      v_status := case when v_sub.trial_ends_at >= p_date and coalesce(v_sub.paid_until, v_sub.started_at - 1) < p_date then 'trial'
                       when v_sub.status = 'suspended' then 'suspended'
                       else 'active' end;
      if v_sub.status = 'past_due' then v_status := 'active'; end if;
    elsif p_date <= v_due + v_sub.grace_days or not v_sub.auto_suspend then
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

    if v_sub.status is distinct from v_status or v_sub.next_due_date is distinct from v_due then
      update public.tenant_subscriptions set status = v_status, next_due_date = v_due, updated_at = now(), updated_by = null, change_reason = 'Daily run'
      where tenant_id = v_sub.tenant_id;
    end if;
  end loop;

  perform public.admin_refresh_health(p_date);

  return jsonb_build_object('date', p_date, 'invoicesIssued', v_issued, 'reminders', v_reminders, 'suspended', v_suspended, 'ended', v_ended);
end;
$$;
revoke all on function public.run_subscription_cycle(date) from public, anon, authenticated;
grant execute on function public.run_subscription_cycle(date) to service_role;
