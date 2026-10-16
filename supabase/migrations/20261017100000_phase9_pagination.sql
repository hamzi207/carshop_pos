-- Phase 9: server-side pagination. Lists are paged in SQL with exact counts, so every
-- filter and sort has to be expressible there (no filtering in JavaScript afterwards).

-- ---- Inventory: stock filter + "lowest stock" sort ------------------------------------
-- available = on hand − reserved on open quotations; low = at or below the item's alert
-- level. Stored generated columns, so PostgREST can filter (?is_low_stock=eq.true) and
-- order (?order=available_quantity) on them; triggers updating reserved_quantity keep them current.
alter table public.inventory_items
  add column available_quantity integer generated always as (quantity_on_hand - reserved_quantity) stored,
  add column is_low_stock boolean generated always as (quantity_on_hand - reserved_quantity <= low_stock_threshold) stored;

create index inventory_items_tenant_name_idx on public.inventory_items (tenant_id, name);

-- ---- Customers: directory totals (the whole directory, not one page) ----------------
create function public.customer_directory_stats()
returns table (total bigint, b2b bigint, outstanding numeric)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    (select count(*) from public.customers c where not c.is_walk_in),
    (select count(*) from public.customers c where not c.is_walk_in and c.customer_type <> 'Retail Customer'),
    -- Unpaid / part-paid invoices of directory customers (walk-in sales aren't owed by anyone).
    (select coalesce(sum(q.total_amount - q.amount_paid), 0)
     from public.quotes q join public.customers c on c.id = q.customer_id
     where q.status = 'invoiced' and not c.is_walk_in);
$$;

revoke all on function public.customer_directory_stats() from public, anon;
grant execute on function public.customer_directory_stats() to authenticated;

-- ---- Documents: one section's list, filtered by displayed status and search ----------
-- p_status_key is the displayed status (src/lib/documents.ts statusKey): pending / due /
-- partial are worked out from payments and the due date (p_today = the shop's local date);
-- anything else matches the stored status. Search: every word must appear in a number,
-- the customer's name or the walk-in buyer's name.
create function public.filter_documents(p_statuses text[], p_status_key text, p_search text, p_today date)
returns setof public.quotes
language sql
stable
security invoker
set search_path = ''
as $$
  with tokens as (
    select distinct token
    from unnest(regexp_split_to_array(lower(btrim(coalesce(p_search, ''))), '\s+')) as token
    where token <> ''
  )
  select q.*
  from public.quotes q
  left join public.customers c on c.id = q.customer_id
  where q.status = any (p_statuses)
    and case coalesce(p_status_key, '')
          when '' then true
          when 'pending' then q.status = 'invoiced' and q.amount_paid = 0 and (q.due_date is null or q.due_date >= p_today)
          when 'due' then q.status = 'invoiced' and q.amount_paid = 0 and q.due_date < p_today
          when 'partial' then q.status = 'invoiced' and q.amount_paid > 0
          else q.status = p_status_key
        end
    and not exists (
      select 1 from tokens t
      where strpos(
        lower(concat_ws(' ', q.quote_number, q.draft_number, q.quotation_number, q.invoice_number, c.name, q.walk_in_name)),
        t.token
      ) = 0
    );
$$;

-- Footer totals for the same filters: total (excluding cancelled) and balance due.
create function public.document_list_totals(p_statuses text[], p_status_key text, p_search text, p_today date)
returns table (total numeric, owed numeric)
language sql
stable
security invoker
set search_path = ''
as $$
  select coalesce(sum(d.total_amount), 0), coalesce(sum(d.total_amount - d.amount_paid), 0)
  from public.filter_documents(p_statuses, p_status_key, p_search, p_today) d
  where d.status not in ('cancelled', 'void');
$$;

revoke all on function public.filter_documents(text[], text, text, date) from public, anon;
revoke all on function public.document_list_totals(text[], text, text, date) from public, anon;
grant execute on function public.filter_documents(text[], text, text, date) to authenticated;
grant execute on function public.document_list_totals(text[], text, text, date) to authenticated;
