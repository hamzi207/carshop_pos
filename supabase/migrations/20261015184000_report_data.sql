-- Phase 6: Reports page. Figures for one date range (same range rules as dashboard_metrics:
-- today | week | month | year | all | custom, shop timezone, shop's first day of the week),
-- plus current snapshots (receivables aging, stock value). SECURITY INVOKER: RLS = caller's shop.
create or replace function public.report_data(p_range text default 'month', p_from date default null, p_to date default null)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  with shop as (
    select timezone as tz, (now() at time zone timezone)::date as today, week_start
    from public.tenants where id = public.current_tenant_id()
  ),
  span as (
    select s.tz, s.today,
      case p_range
        when 'today' then s.today
        when 'week' then s.today - ((extract(isodow from s.today)::int - s.week_start + 7) % 7)
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
  inv as (
    select q.id, q.customer_id, q.walk_in_name, q.total_amount, q.tax_amount, q.amount_paid,
           (q.invoiced_at at time zone b.tz)::date as local_day
    from public.quotes q, bounds b
    where q.status in ('invoiced', 'paid') and q.invoiced_at >= b.t_from and q.invoiced_at < b.t_to
  ),
  lines as (
    -- Each line's net revenue = its share of the invoice total excluding tax (so invoice discounts count).
    select i.item_id, i.description, i.quantity, i.unit_cost * i.quantity as cost,
           case when sum(i.total_price) over (partition by i.quote_id) > 0
                then i.total_price / sum(i.total_price) over (partition by i.quote_id) * (v.total_amount - v.tax_amount)
                else 0 end as revenue
    from public.quote_items i join inv v on v.id = i.quote_id
  ),
  buckets as (
    select g::date as b_start, (g + ('1 ' || b.grain)::interval)::date as b_end
    from bounds b, generate_series(date_trunc(b.grain, b.d_from::timestamp), b.d_to::timestamp, ('1 ' || b.grain)::interval) as g
  ),
  pay as (
    select p.payment_method, p.amount
    from public.invoice_payments p, bounds b
    where p.paid_on between b.d_from and b.d_to
  ),
  open_inv as (
    select q.total_amount - q.amount_paid as balance, q.due_date, b.today
    from public.quotes q, bounds b where q.status = 'invoiced'
  )
  select jsonb_build_object(
    'from', b.d_from, 'to', b.d_to, 'grain', b.grain,
    'summary', jsonb_build_object(
      'sales', (select coalesce(sum(total_amount), 0) from inv),
      'tax', (select coalesce(sum(tax_amount), 0) from inv),
      'cost', (select coalesce(sum(cost), 0) from lines),
      'invoices', (select count(*) from inv),
      'outstanding', (select coalesce(sum(total_amount - amount_paid), 0) from inv),
      'collected', (select coalesce(sum(amount), 0) from pay)),
    'series', (select coalesce(jsonb_agg(jsonb_build_object('start', k.b_start,
        'sales', coalesce((select sum(v.total_amount) from inv v where v.local_day >= k.b_start and v.local_day < k.b_end), 0))
        order by k.b_start), '[]'::jsonb) from buckets k),
    'products', (select coalesce(jsonb_agg(p order by (p->>'revenue')::numeric desc), '[]'::jsonb) from (
        select jsonb_build_object('name', max(l.description), 'sku', max(it.sku), 'custom', l.item_id is null,
                 'qty', sum(l.quantity), 'revenue', round(sum(l.revenue), 2), 'profit', round(sum(l.revenue - l.cost), 2)) as p
        from lines l left join public.inventory_items it on it.id = l.item_id
        group by l.item_id, case when l.item_id is null then l.description end
        order by sum(l.revenue) desc limit 50) t),
    'customers', (select coalesce(jsonb_agg(c order by (c->>'sales')::numeric desc), '[]'::jsonb) from (
        select jsonb_build_object('id', cu.id, 'name', case when cu.is_walk_in then 'Walk-in / cash sales' else cu.name end,
                 'invoices', count(*), 'sales', sum(v.total_amount), 'outstanding', sum(v.total_amount - v.amount_paid)) as c
        from inv v join public.customers cu on cu.id = v.customer_id
        group by cu.id, cu.name, cu.is_walk_in
        order by sum(v.total_amount) desc limit 50) t),
    'payments', (select coalesce(jsonb_agg(jsonb_build_object('method', payment_method, 'count', n, 'amount', total) order by total desc), '[]'::jsonb)
                 from (select payment_method, count(*) as n, sum(amount) as total from pay group by payment_method) t),
    'aging', (select jsonb_build_object(
        'notDue', jsonb_build_object('count', count(*) filter (where due_date is null or due_date >= today), 'total', coalesce(sum(balance) filter (where due_date is null or due_date >= today), 0)),
        'd30', jsonb_build_object('count', count(*) filter (where due_date < today and due_date >= today - 30), 'total', coalesce(sum(balance) filter (where due_date < today and due_date >= today - 30), 0)),
        'd60', jsonb_build_object('count', count(*) filter (where due_date < today - 30 and due_date >= today - 60), 'total', coalesce(sum(balance) filter (where due_date < today - 30 and due_date >= today - 60), 0)),
        'd60plus', jsonb_build_object('count', count(*) filter (where due_date < today - 60), 'total', coalesce(sum(balance) filter (where due_date < today - 60), 0)))
      from open_inv),
    'stock', (select jsonb_build_object(
        'items', count(*),
        'units', coalesce(sum(quantity_on_hand), 0),
        'reserved', coalesce(sum(reserved_quantity), 0),
        'costValue', coalesce(sum(quantity_on_hand * cost_price), 0),
        'retailValue', coalesce(sum(quantity_on_hand * selling_price), 0),
        'low', coalesce(jsonb_agg(jsonb_build_object('name', name, 'sku', sku, 'free', quantity_on_hand - reserved_quantity, 'threshold', low_stock_threshold)
                 order by quantity_on_hand - reserved_quantity) filter (where quantity_on_hand - reserved_quantity <= low_stock_threshold), '[]'::jsonb))
      from public.inventory_items)
  )
  from bounds b;
$$;

revoke all on function public.report_data(text, date, date) from public, anon;
grant execute on function public.report_data(text, date, date) to authenticated;
