-- =============================================================================
-- Phase 5: Drafts / Quotations / Invoices (PROJECT_SPEC.md Phase 5, step 4)
-- =============================================================================
-- One quotes row is one document; it moves draft → quotation → invoice and
-- keeps every number it has had. quote_number (re-created as a generated
-- column in a later migration) is always the current one.

alter table public.quotes
  add column draft_number text,
  add column quotation_number text,
  add column invoice_number text,
  add column quoted_at timestamptz,
  add column invoiced_at timestamptz,
  -- Discount as the user entered it; discount_amount holds the rupee value.
  add column discount_type text not null default 'amount'
    constraint quotes_discount_type_check check (discount_type in ('amount', 'percent')),
  add column discount_value numeric(12,2) not null default 0
    constraint quotes_discount_value_check check (discount_value >= 0),
  -- Internal notes: never printed on the customer's copy.
  add column notes text;

alter table public.quotes
  add constraint uq_tenant_draft_number unique (tenant_id, draft_number),
  add constraint uq_tenant_quotation_number unique (tenant_id, quotation_number),
  add constraint uq_tenant_invoice_number unique (tenant_id, invoice_number),
  -- Each stage has its number: drafts only a D-, quotations a Q- (and maybe
  -- the D- they came from), invoices an INV- (and any earlier numbers).
  add constraint quotes_stage_numbers_check check (
    (status = 'draft' and draft_number is not null and quotation_number is null and invoice_number is null)
    or (status in ('sent', 'accepted', 'cancelled') and quotation_number is not null and invoice_number is null)
    or (status in ('invoiced', 'paid') and invoice_number is not null)
  );

-- Lines keep the tax treatment they were priced with, and their order.
alter table public.quote_items
  add column price_includes_tax boolean not null default true,
  add column sort_order integer not null default 0;

-- Drafts can be thrown away; quotations and invoices are kept for the record.
create policy "Tenant isolation for draft delete"
  on public.quotes for delete to authenticated
  using (tenant_id = public.current_tenant_id() and status = 'draft');
