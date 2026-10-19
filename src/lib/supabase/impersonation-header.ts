/**
 * Superadmin "Login As" (Phase 13). The raw token lives in this httpOnly cookie; the server's
 * Supabase client forwards it on every request as the header below, and the database's
 * private.current_tenant_id() honours it only for the superadmin it was issued to.
 */
export const IMPERSONATION_COOKIE = "carshop_impersonation";
export const IMPERSONATION_HEADER = "x-carshop-impersonation";
/** How long one "Login As" lasts before it has to be started again. */
export const IMPERSONATION_TTL_SECONDS = 2 * 60 * 60;
