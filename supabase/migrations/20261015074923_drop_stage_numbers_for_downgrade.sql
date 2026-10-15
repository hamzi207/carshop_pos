-- Quotation → Draft downgrades keep their Q- number for re-issue, so the
-- stage/number rule and the current-number column are redefined next.
alter table public.quotes drop constraint quotes_stage_numbers_check;
alter table public.quotes drop column quote_number;
