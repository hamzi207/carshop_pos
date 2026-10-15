-- Dashboard figures for one chosen date range instead of fixed periods.
-- p_range: today | week | month | year | all | custom (custom uses p_from / p_to).
-- Dates are the shop's local dates; weeks start on Monday. Returns the range's
-- totals, a trend series (by day up to a month, by month up to two years,
-- otherwise by year), unpaid balances by age and open quotations by status.
drop function if exists public.dashboard_metrics();

create or replace function public.dashboard_metrics(p_range text default 'month', p_from date default null, p_to date default null)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  with shop as (
    select timezone as tz, (now() at time zone timezone)::date as today
    from public.tenants where id = public.current_tenant_id()
  ),
  span as (
    select s.tz, s.today,
      case p_range
        when 'today' then s.today
        when 'week' then date_trunc('week', s.today::timestamp)::date
        when 'year' then date_trunc('year', s.today::timestamp)::date
        when 'all' then coalesce(
          (select min((coalesce(q.invoiced_at, q.quoted_at) at time zone s.tz)::date)
           from public.quotes q where coalesce(q.invoiced_at, q.quoted_at) is not null),
          s.today)
        when 'custom' then coalesce(least(p_from, p_to), p_from, p_to, s.today)
        else date_trunc('month', s.today::timestamp)::date
      end as d_from,
      case p_range
        when 'custom' then coalesce(greatest(p_from, p_to), p_to, p_from, s.today)
        else s.today
      end as d_to
    from shop s
  ),
  bounds as (
    select tz, today, d_from, d_to,
      d_from::timestamp at time zone tz as t_from,
      (d_to + 1)::timestamp at time zone tz as t_to,
      case when d_to - d_from <= 31 then 'day' when d_to - d_from <= 731 then 'month' else 'year' end as grain
    from span
  ),
  invoices as (
    select (q.invoiced_at at time zone b.tz)::date as local_day, q.status, q.total_amount, q.tax_amount, q.due_date,
           q.total_amount - q.amount_paid as balance,
           q.total_amount - q.tax_amount
           - coalesce((select sum(i.unit_cost * i.quantity) from public.quote_items i where i.quote_id = q.id), 0) as profit
    from public.quotes q, bounds b
    where q.status in ('invoiced', 'paid') and q.invoiced_at >= b.t_from and q.invoiced_at < b.t_to
  ),
  open_quotes as (
    select q.status, q.total_amount
    from public.quotes q, bounds b
    where q.status in ('sent', 'accepted') and (q.valid_until is null or q.valid_until >= now())
      and q.quoted_at >= b.t_from and q.quoted_at < b.t_to
  ),
  buckets as (
    select g::date as b_start,
      (g + ('1 ' || b.grain)::interval)::date as b_end
    from bounds b, generate_series(date_trunc(b.grain, b.d_from::timestamp), b.d_to::timestamp, ('1 ' || b.grain)::interval) as g
  )
  select jsonb_build_object(
    'from', b.d_from,
    'to', b.d_to,
    'grain', b.grain,
    'sales', (select coalesce(sum(total_amount), 0) from invoices),
    'tax', (select coalesce(sum(tax_amount), 0) from invoices),
    'profit', (select coalesce(sum(profit), 0) from invoices),
    'invoiceCount', (select count(*) from invoices),
    'pendingInvoices', (select jsonb_build_object('count', count(*), 'total', coalesce(sum(balance), 0))
      from invoices where status = 'invoiced'),
    'pendingQuotations', (select jsonb_build_object('count', count(*), 'total', coalesce(sum(total_amount), 0))
      from open_quotes),
    'series', (select coalesce(jsonb_agg(jsonb_build_object(
          'start', k.b_start,
          'sales', coalesce((select sum(i.total_amount) from invoices i where i.local_day >= k.b_start and i.local_day < k.b_end), 0),
          'profit', coalesce((select sum(i.profit) from invoices i where i.local_day >= k.b_start and i.local_day < k.b_end), 0)
        ) order by k.b_start), '[]'::jsonb)
      from buckets k),
    'aging', (select jsonb_build_object(
        'notDue', jsonb_build_object('count', count(*) filter (where i.due_date is null or i.due_date >= b.today),
                                     'total', coalesce(sum(i.balance) filter (where i.due_date is null or i.due_date >= b.today), 0)),
        'overdue30', jsonb_build_object('count', count(*) filter (where i.due_date < b.today and i.due_date >= b.today - 30),
                                        'total', coalesce(sum(i.balance) filter (where i.due_date < b.today and i.due_date >= b.today - 30), 0)),
        'overdue60', jsonb_build_object('count', count(*) filter (where i.due_date < b.today - 30 and i.due_date >= b.today - 60),
                                        'total', coalesce(sum(i.balance) filter (where i.due_date < b.today - 30 and i.due_date >= b.today - 60), 0)),
        'overdue60plus', jsonb_build_object('count', count(*) filter (where i.due_date < b.today - 60),
                                            'total', coalesce(sum(i.balance) filter (where i.due_date < b.today - 60), 0)))
      from invoices i where i.status = 'invoiced'),
    'quotesByStatus', (select jsonb_build_object(
        'sent', jsonb_build_object('count', count(*) filter (where status = 'sent'), 'total', coalesce(sum(total_amount) filter (where status = 'sent'), 0)),
        'accepted', jsonb_build_object('count', count(*) filter (where status = 'accepted'), 'total', coalesce(sum(total_amount) filter (where status = 'accepted'), 0)))
      from open_quotes),
    'counts', jsonb_build_object(
      'customers', (select count(*) from public.customers where not is_walk_in),
      'products', (select count(*) from public.inventory_items),
      'quotations', (select count(*) from public.quotes q
                     where q.status in ('sent', 'accepted', 'cancelled') and q.quoted_at >= b.t_from and q.quoted_at < b.t_to),
      'invoices', (select count(*) from public.quotes q
                   where q.status in ('invoiced', 'paid', 'void') and q.invoiced_at >= b.t_from and q.invoiced_at < b.t_to)
    )
  )
  from bounds b;
$$;

revoke all on function public.dashboard_metrics(text, date, date) from public, anon;
grant execute on function public.dashboard_metrics(text, date, date) to authenticated;
