-- Event-trigger function (auto-enables RLS on new public tables): the system runs it on DDL;
-- no role needs to call it through the API.
revoke execute on function public.rls_auto_enable() from public, anon, authenticated;
