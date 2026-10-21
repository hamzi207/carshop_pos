import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { cache } from "react";
import { cookies } from "next/headers";
import { audit } from "@/lib/superadmin";
import { createAdminClient } from "@/lib/supabase/admin";
import { IMPERSONATION_COOKIE, OLD_IMPERSONATION_COOKIE, readImpersonationToken } from "@/lib/supabase/impersonation-header";

/** Only the token's SHA-256 is stored (impersonation_sessions.token_hash); the database hashes the header the same way. */
export const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

export const newToken = () => randomBytes(32).toString("base64url");

export type Impersonation = {
  sessionId: string;
  adminId: string;
  tenantId: string;
  tenantName: string;
  startedAt: string;
  expiresAt: string;
  /** Phase 17: "read_only" sessions can look but not change anything. */
  mode: "full" | "read_only";
};

/**
 * The open "Login As" session behind this request's cookie, if it belongs to `userId` and hasn't
 * ended or expired. (The database applies the same rules on every query; this is for the banner
 * and for code that needs to know whose shop it is.)
 */
export const getImpersonation = cache(async (userId: string): Promise<Impersonation | null> => {
  const token = readImpersonationToken(await cookies());
  if (!token) return null;
  const { data } = await createAdminClient()
    .from("impersonation_sessions")
    .select("id, admin_id, tenant_id, started_at, expires_at, mode, tenants(name)")
    .eq("token_hash", hashToken(token))
    .eq("admin_id", userId)
    .is("ended_at", null)
    .gt("expires_at", new Date().toISOString())
    .maybeSingle();
  if (!data?.tenants) return null;
  return {
    sessionId: data.id,
    adminId: data.admin_id,
    tenantId: data.tenant_id,
    tenantName: data.tenants.name,
    startedAt: data.started_at,
    expiresAt: data.expires_at,
    mode: data.mode === "read_only" ? "read_only" : "full",
  };
});

/**
 * Ends the "Login As" behind this request's cookie (the banner's Exit), removes the cookie and
 * logs how long it lasted. Shared by the exit route; safe to call without a session.
 */
export async function closeImpersonation() {
  const store = await cookies();
  const token = readImpersonationToken(store);
  store.delete(IMPERSONATION_COOKIE);
  store.delete(OLD_IMPERSONATION_COOKIE);
  if (!token) return;
  const { data: session } = await createAdminClient()
    .from("impersonation_sessions")
    .update({ ended_at: new Date().toISOString() })
    .eq("token_hash", hashToken(token))
    .is("ended_at", null)
    .select("id, admin_id, tenant_id, started_at, mode")
    .maybeSingle();
  if (session) {
    const minutes = Math.round((Date.now() - new Date(session.started_at).getTime()) / 60000);
    await audit({ adminId: session.admin_id, action: "impersonation.end", tenantId: session.tenant_id, details: { sessionId: session.id, minutes, mode: session.mode } });
  }
}
