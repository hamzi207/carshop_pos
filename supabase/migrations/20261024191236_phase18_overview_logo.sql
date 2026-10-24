-- Show or hide the shop logo on the Overview page. Admin-editable like the other shop settings.
alter table public.tenants add column show_overview_logo boolean not null default true;

grant update (show_overview_logo) on public.tenants to authenticated;
