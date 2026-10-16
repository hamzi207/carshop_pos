-- Phase 6: shop tax numbers for the invoice header, and an unguessable share token per document
-- (the customer's view-only link: /share/<token>). Tokens are read only by server code.
alter table public.tenants
  add column ntn varchar(20) constraint tenants_ntn_format_check check (ntn is null or ntn ~ '^[0-9]{7}(-[0-9])?$'),
  add column strn varchar(20) constraint tenants_strn_format_check check (strn is null or strn ~ '^[0-9]{13}$');
grant update (ntn, strn) on public.tenants to authenticated;

alter table public.quotes add column share_token uuid not null default gen_random_uuid();
alter table public.quotes add constraint quotes_share_token_key unique (share_token);
