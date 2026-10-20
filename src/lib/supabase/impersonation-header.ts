/**
 * Superadmin "Login As" (Phase 13). The raw token lives in this httpOnly cookie; the server's
 * Supabase client forwards it on every request as the header below, and the database's
 * private.current_tenant_id() honours it only for the superadmin it was issued to.
 */
export const IMPERSONATION_COOKIE = "productlogik_impersonation";
export const IMPERSONATION_HEADER = "x-productlogik-impersonation";
/**
 * Version 1 cookie name. A "Login As" started before the rename is still honoured (read, forwarded
 * under the new header, cleared on exit) until it expires; dropped in Phase 33.
 */
export const OLD_IMPERSONATION_COOKIE = "carshop_impersonation";
/** How long one "Login As" lasts before it has to be started again. */
export const IMPERSONATION_TTL_SECONDS = 2 * 60 * 60;

/** The "Login As" token from either cookie name (new first). Works with next/headers cookies() and request.cookies. */
export function readImpersonationToken(store: { get(name: string): { value: string } | undefined }): string | undefined {
  return store.get(IMPERSONATION_COOKIE)?.value ?? store.get(OLD_IMPERSONATION_COOKIE)?.value;
}
