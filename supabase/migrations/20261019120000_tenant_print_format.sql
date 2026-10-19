-- Phase 11: how the shop prints documents from the document screens.
-- 'a4' = A4 PDF (view / download), 'pos' = 80mm POS slip printed straight from the screen.
alter table public.tenants add column print_format text not null default 'a4'
  constraint tenants_print_format_check check (print_format in ('a4', 'pos'));
grant update (print_format) on public.tenants to authenticated;
