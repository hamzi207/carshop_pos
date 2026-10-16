-- Security advisor: SECURITY DEFINER functions in the exposed `public` schema are callable via /rest/v1/rpc.
-- Move the real helper to a private (non-API) schema. RLS policies reference it by OID, so they keep
-- working unchanged; functions that call public.current_tenant_id() by name get a SECURITY INVOKER
-- wrapper (not flagged, and it can only ever return the caller's own tenant).
create schema if not exists private;
grant usage on schema private to authenticated;

alter function public.current_tenant_id() set schema private;
revoke all on function private.current_tenant_id() from public, anon;
grant execute on function private.current_tenant_id() to authenticated;

create function public.current_tenant_id()
returns uuid
language sql
stable
security invoker
set search_path = ''
as $$
  select private.current_tenant_id();
$$;
revoke all on function public.current_tenant_id() from public, anon;
grant execute on function public.current_tenant_id() to authenticated;
