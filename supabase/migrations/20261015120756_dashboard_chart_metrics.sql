-- Dashboard charts: per-period tax (to split sales into profit / cost / tax),
-- the last 6 months of sales and profit, unpaid balances by age, and open
-- quotations by status. Everything in the shop's timezone.
create or replace function public.dashboard_metrics()
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  with shop as (
    select timezone as tz, now() at time zone timezone as local_now, (now() at time zone timezone)::date as today
    from public.tenants where id = public.current_tenant_id()
  ),
  bounds as (
    select
      date_trunc('day', local_now) at time zone tz as day,
      date_trunc('week', local_now) at time zone tz as week,
      date_trunc('month', local_now) at time zone tz as month,
      date_trunc('year', local_now) at time zone tz as year
    from shop
  ),
  invoices as (
    select q.invoiced_at as at, q.status, q.total_amount, q.tax_amount, q.due_date,
           q.total_amount - q.amount_paid as balance,
           q.total_amount - q.tax_amount
           - coalesce((select sum(i.unit_cost * i.quantity) from public.quote_items i where i.quote_id = q.id), 0) as profit
    from public.quotes q
    where q.status in ('invoiced', 'paid')
  ),
  open_quotes as (
    select q.quoted_at as at, q.status, q.total_amount
    from public.quotes q
    where q.status in ('sent', 'accepted') and (q.valid_until is null or q.valid_until >= now())
  ),
  months as (
    select (date_trunc('month', s.local_now) - make_interval(months => n))::date as month_start, s.tz
    from shop s, generate_series(0, 5) as n
  )
  select jsonb_build_object(
    'sales', (select jsonb_build_object(
        'day', coalesce(sum(total_amount) filter (where at >= b.day), 0),
        'week', coalesce(sum(total_amount) filter (where at >= b.week), 0),
        'month', coalesce(sum(total_amount) filter (where at >= b.month), 0),
        'year', coalesce(sum(total_amount) filter (where at >= b.year), 0),
        'all', coalesce(sum(total_amount), 0))
      from invoices, bounds b),
    'tax', (select jsonb_build_object(
        'day', coalesce(sum(tax_amount) filter (where at >= b.day), 0),
        'week', coalesce(sum(tax_amount) filter (where at >= b.week), 0),
        'month', coalesce(sum(tax_amount) filter (where at >= b.month), 0),
        'year', coalesce(sum(tax_amount) filter (where at >= b.year), 0),
        'all', coalesce(sum(tax_amount), 0))
      from invoices, bounds b),
    'profit', (select jsonb_build_object(
        'day', coalesce(sum(profit) filter (where at >= b.day), 0),
        'week', coalesce(sum(profit) filter (where at >= b.week), 0),
        'month', coalesce(sum(profit) filter (where at >= b.month), 0),
        'year', coalesce(sum(profit) filter (where at >= b.year), 0),
        'all', coalesce(sum(profit), 0))
      from invoices, bounds b),
    'pendingInvoices', (select jsonb_build_object(
        'day', jsonb_build_object('count', count(*) filter (where at >= b.day), 'total', coalesce(sum(balance) filter (where at >= b.day), 0)),
        'week', jsonb_build_object('count', count(*) filter (where at >= b.week), 'total', coalesce(sum(balance) filter (where at >= b.week), 0)),
        'month', jsonb_build_object('count', count(*) filter (where at >= b.month), 'total', coalesce(sum(balance) filter (where at >= b.month), 0)),
        'year', jsonb_build_object('count', count(*) filter (where at >= b.year), 'total', coalesce(sum(balance) filter (where at >= b.year), 0)),
        'all', jsonb_build_object('count', count(*), 'total', coalesce(sum(balance), 0)))
      from invoices, bounds b where status = 'invoiced'),
    'pendingQuotations', (select jsonb_build_object(
        'day', jsonb_build_object('count', count(*) filter (where at >= b.day), 'total', coalesce(sum(total_amount) filter (where at >= b.day), 0)),
        'week', jsonb_build_object('count', count(*) filter (where at >= b.week), 'total', coalesce(sum(total_amount) filter (where at >= b.week), 0)),
        'month', jsonb_build_object('count', count(*) filter (where at >= b.month), 'total', coalesce(sum(total_amount) filter (where at >= b.month), 0)),
        'year', jsonb_build_object('count', count(*) filter (where at >= b.year), 'total', coalesce(sum(total_amount) filter (where at >= b.year), 0)),
        'all', jsonb_build_object('count', count(*), 'total', coalesce(sum(total_amount), 0)))
      from open_quotes, bounds b),
    'months', (select coalesce(jsonb_agg(jsonb_build_object(
          'month', to_char(m.month_start, 'YYYY-MM'),
          'sales', coalesce((select sum(i.total_amount) from invoices i
                             where i.at >= (m.month_start::timestamp at time zone m.tz)
                               and i.at < ((m.month_start + interval '1 month')::timestamp at time zone m.tz)), 0),
          'profit', coalesce((select sum(i.profit) from invoices i
                              where i.at >= (m.month_start::timestamp at time zone m.tz)
                                and i.at < ((m.month_start + interval '1 month')::timestamp at time zone m.tz)), 0)
        ) order by m.month_start), '[]'::jsonb)
      from months m),
    'aging', (select jsonb_build_object(
        'notDue', jsonb_build_object('count', count(*) filter (where i.due_date is null or i.due_date >= s.today),
                                     'total', coalesce(sum(i.balance) filter (where i.due_date is null or i.due_date >= s.today), 0)),
        'overdue30', jsonb_build_object('count', count(*) filter (where i.due_date < s.today and i.due_date >= s.today - 30),
                                        'total', coalesce(sum(i.balance) filter (where i.due_date < s.today and i.due_date >= s.today - 30), 0)),
        'overdue60', jsonb_build_object('count', count(*) filter (where i.due_date < s.today - 30 and i.due_date >= s.today - 60),
                                        'total', coalesce(sum(i.balance) filter (where i.due_date < s.today - 30 and i.due_date >= s.today - 60), 0)),
        'overdue60plus', jsonb_build_object('count', count(*) filter (where i.due_date < s.today - 60),
                                            'total', coalesce(sum(i.balance) filter (where i.due_date < s.today - 60), 0)))
      from invoices i, shop s where i.status = 'invoiced'),
    'quotesByStatus', (select jsonb_build_object(
        'sent', jsonb_build_object('count', count(*) filter (where status = 'sent'), 'total', coalesce(sum(total_amount) filter (where status = 'sent'), 0)),
        'accepted', jsonb_build_object('count', count(*) filter (where status = 'accepted'), 'total', coalesce(sum(total_amount) filter (where status = 'accepted'), 0)))
      from open_quotes),
    'counts', jsonb_build_object(
      'customers', (select count(*) from public.customers where not is_walk_in),
      'products', (select count(*) from public.inventory_items),
      'quotations', (select count(*) from public.quotes where status in ('sent', 'accepted', 'cancelled')),
      'invoices', (select count(*) from public.quotes where status in ('invoiced', 'paid', 'void'))
    )
  );
$$;
