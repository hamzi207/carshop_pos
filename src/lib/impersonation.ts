import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { cache } from "react";
import { cookies } from "next/headers";
import { createAdminClient } from "@/lib/supabase/admin";
import { IMPERSONATION_COOKIE } from "@/lib/supabase/impersonation-header";

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
};

/**
 * The open "Login As" session behind this request's cookie, if it belongs to `userId` and hasn't
 * ended or expired. (The database applies the same rules on every query; this is for the banner
 * and for code that needs to know whose shop it is.)
 */
export const getImpersonation = cache(async (userId: string): Promise<Impersonation | null> => {
  const token = (await cookies()).get(IMPERSONATION_COOKIE)?.value;
  if (!token) return null;
  const { data } = await createAdminClient()
    .from("impersonation_sessions")
    .select("id, admin_id, tenant_id, started_at, expires_at, tenants(name)")
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
  };
});
