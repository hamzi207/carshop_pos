-- Show or hide the dashboard clock. Admin-editable like the other shop settings.
alter table public.tenants add column show_clock boolean not null default true;

grant update (show_clock) on public.tenants to authenticated;
