-- Dashboard clock design: digital or analog. Admin-editable like the other shop settings.
alter table public.tenants
  add column clock_style text not null default 'digital'
  constraint tenants_clock_style_check check (clock_style in ('digital', 'analog'));

grant update (clock_style) on public.tenants to authenticated;
