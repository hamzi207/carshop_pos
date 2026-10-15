-- Invoices gain a 'void' (cancelled) status and paid is now derived from
-- payments, so the status rules and the old payment function are redefined next.
alter table public.quotes drop constraint quotes_status_check;
alter table public.quotes drop constraint quotes_stage_numbers_check;
drop function public.process_quote_payment(uuid, text, text);
