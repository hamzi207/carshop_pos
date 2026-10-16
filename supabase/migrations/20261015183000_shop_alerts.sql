-- Phase 6: the notification bell. Live alerts derived from the shop's data (nothing stored):
-- low / out-of-stock parts (free = on hand − reserved), overdue invoices, invoices due within 3 days,
-- quotations expiring within 3 days, and expired quotations that still reserve stock.
-- Dates in the shop's timezone. SECURITY INVOKER: RLS limits everything to the caller's shop.
create or replace function public.shop_alerts()
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
  docs as (
    select q.id, q.quote_number, q.status, q.total_amount - q.amount_paid as balance, q.total_amount,
           q.due_date, (q.valid_until at time zone s.tz)::date as valid_day, s.today,
           case when c.is_walk_in then coalesce(nullif(q.walk_in_name, ''), 'Walk-in customer') else c.name end as customer
    from public.quotes q
    join public.customers c on c.id = q.customer_id
    cross join shop s
    where q.status in ('invoiced', 'sent', 'accepted')
  )
  select jsonb_build_object(
    'lowStock', (select coalesce(jsonb_agg(jsonb_build_object('id', i.id, 'name', i.name, 'sku', i.sku,
                    'free', i.quantity_on_hand - i.reserved_quantity, 'threshold', i.low_stock_threshold)
                    order by i.quantity_on_hand - i.reserved_quantity, i.name), '[]'::jsonb)
                 from (select * from public.inventory_items
                       where quantity_on_hand - reserved_quantity <= low_stock_threshold
                       order by quantity_on_hand - reserved_quantity, name limit 25) i),
    'overdue', (select coalesce(jsonb_agg(jsonb_build_object('id', id, 'number', quote_number, 'customer', customer,
                   'balance', balance, 'days', today - due_date) order by due_date), '[]'::jsonb)
                from (select * from docs where status = 'invoiced' and due_date < today order by due_date limit 25) d),
    'dueSoon', (select coalesce(jsonb_agg(jsonb_build_object('id', id, 'number', quote_number, 'customer', customer,
                   'balance', balance, 'days', due_date - today) order by due_date), '[]'::jsonb)
                from (select * from docs where status = 'invoiced' and due_date between today and today + 3 order by due_date limit 25) d),
    'expiring', (select coalesce(jsonb_agg(jsonb_build_object('id', id, 'number', quote_number, 'customer', customer,
                    'total', total_amount, 'days', valid_day - today) order by valid_day), '[]'::jsonb)
                 from (select * from docs where status in ('sent', 'accepted') and valid_day between today and today + 3 order by valid_day limit 25) d),
    'expired', (select coalesce(jsonb_agg(jsonb_build_object('id', id, 'number', quote_number, 'customer', customer,
                   'total', total_amount, 'days', today - valid_day) order by valid_day), '[]'::jsonb)
                from (select * from docs where status in ('sent', 'accepted') and valid_day < today order by valid_day limit 25) d)
  );
$$;

revoke all on function public.shop_alerts() from public, anon;
grant execute on function public.shop_alerts() to authenticated;
