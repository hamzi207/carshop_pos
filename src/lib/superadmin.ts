import "server-only";
import { cache } from "react";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import type { Json } from "@/lib/types/database.types";

export type Superadmin = { userId: string; fullName: string; email: string };

/**
 * Superadmins are their own accounts (platform_admins), separate from shops: no shop profile, signed
 * in at /admin/login. The account's app_metadata.platform_admin mirrors the table so the proxy can
 * route without a database read; the table is what grants access.
 */
export const PLATFORM_ADMIN_CLAIM = "platform_admin";

/** Whether this account is an active platform superadmin (service role: the table has no RLS policies). */
export async function isSuperadmin(userId: string) {
  const { data } = await createAdminClient().from("platform_admins").select("id").eq("id", userId).is("removed_at", null).maybeSingle();
  return data !== null;
}

/** Keeps the routing hint in the account's app_metadata in step with platform_admins. */
export async function setPlatformAdminClaim(userId: string, on: boolean) {
  const { error } = await createAdminClient().auth.admin.updateUserById(userId, { app_metadata: { [PLATFORM_ADMIN_CLAIM]: on } });
  if (error) console.error("setPlatformAdminClaim failed:", error);
  return !error;
}

/**
 * The signed-in superadmin and whether this session passed two-factor sign-in (RF-17.1), or null
 * for anyone else. Cached per request.
 */
export const getSuperadminSession = cache(async () => {
  const { data: claims } = await (await createClient()).auth.getClaims();
  const userId = claims?.claims?.sub;
  if (!userId) return null;
  const { data } = await createAdminClient()
    .from("platform_admins")
    .select("full_name, email")
    .eq("id", userId)
    .is("removed_at", null)
    .maybeSingle();
  if (!data) return null;
  return { userId, fullName: data.full_name, email: data.email, aal2: claims?.claims?.aal === "aal2" };
});

/**
 * Guard for /admin pages and superadmin actions: the signed-in account must be an active platform
 * admin with a two-factor (aal2) session. Anyone else goes to /admin/login; a superadmin who hasn't
 * entered their code yet goes to /admin/mfa (the proxy does the same for /admin URLs). Cached per request.
 */
export const requireSuperadmin = cache(async (): Promise<Superadmin> => {
  const session = await getSuperadminSession();
  if (!session) redirect("/admin/login");
  if (!session.aal2) redirect("/admin/mfa");
  return { userId: session.userId, fullName: session.fullName, email: session.email };
});

/** Names for audit rows, notes and follow-ups: superadmins first, then shop users. */
export async function peopleNames(ids: string[]) {
  const unique = [...new Set(ids)];
  const names = new Map<string, { fullName: string; email: string }>();
  if (!unique.length) return names;
  const admin = createAdminClient();
  const [{ data: admins }, { data: users }] = await Promise.all([
    admin.from("platform_admins").select("id, full_name, email").in("id", unique),
    admin.from("profiles").select("id, full_name, email").in("id", unique),
  ]);
  for (const p of [...(users ?? []), ...(admins ?? [])]) names.set(p.id, { fullName: p.full_name, email: p.email });
  return names;
}

/** The caller's IP for the audit log (first hop of x-forwarded-for), or null. */
export async function requestIp() {
  const h = await headers();
  const ip = (h.get("x-forwarded-for")?.split(",")[0] ?? h.get("x-real-ip") ?? "").trim();
  // inet column: keep only something that looks like an IPv4 / IPv6 address.
  return /^[0-9a-f.:]{3,45}$/i.test(ip) ? ip : null;
}

/** One row in superadmin_audit_logs. Never throws: a failed log is reported, not fatal. */
export async function audit(entry: {
  adminId: string;
  action: string;
  tenantId?: string | null;
  userId?: string | null;
  details?: Record<string, Json>;
  /** Why (archive, overrides, deletes): shown in the audit log. */
  reason?: string | null;
}) {
  const { error } = await createAdminClient().from("superadmin_audit_logs").insert({
    admin_id: entry.adminId,
    action: entry.action,
    target_tenant_id: entry.tenantId ?? null,
    target_user_id: entry.userId ?? null,
    details: entry.details ?? {},
    reason: entry.reason ?? null,
    ip_address: await requestIp(),
  });
  if (error) console.error("superadmin audit log failed:", error);
}

/** Only the keys whose value changed, as { before, after } for an audit row. */
export function changedFields(before: Record<string, unknown>, after: Record<string, unknown>) {
  const keys = Object.keys(after).filter((k) => JSON.stringify(before[k] ?? null) !== JSON.stringify(after[k] ?? null));
  return {
    before: Object.fromEntries(keys.map((k) => [k, (before[k] ?? null) as Json])),
    after: Object.fromEntries(keys.map((k) => [k, (after[k] ?? null) as Json])),
  };
}
