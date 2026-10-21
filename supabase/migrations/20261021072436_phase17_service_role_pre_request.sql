-- Phase 17 fix: PostgREST runs private.pre_request (read-only Login As) before every API request,
-- including the service role's. service_role could execute the function but had no USAGE on the
-- private schema, so every service-role request failed with "permission denied for schema private".
grant usage on schema private to service_role;
