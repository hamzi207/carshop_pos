-- Digital dashboard clock: 12-hour (default) or 24-hour time. Admin-editable like the other shop settings.
alter table public.tenants add column clock_24_hour boolean not null default false;

grant update (clock_24_hour) on public.tenants to authenticated;
