import "server-only";
import { cache } from "react";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import type { Json } from "@/lib/types/database.types";

export type Superadmin = { userId: string; fullName: string; email: string };

/** Whether this user is a platform superadmin (read with the service role: while impersonating, RLS hides their own profile). */
export async function isSuperadmin(userId: string) {
  const { data } = await createAdminClient().from("profiles").select("is_superadmin").eq("id", userId).maybeSingle();
  return data?.is_superadmin === true;
}

/**
 * Guard for /admin pages and superadmin actions: the signed-in user must have profiles.is_superadmin.
 * Everyone else goes to /dashboard (the proxy does the same for /admin URLs). Cached per request.
 */
export const requireSuperadmin = cache(async (): Promise<Superadmin> => {
  const { data: claims } = await (await createClient()).auth.getClaims();
  const userId = claims?.claims?.sub;
  if (!userId) redirect("/login");
  const { data } = await createAdminClient()
    .from("profiles")
    .select("full_name, email, is_superadmin")
    .eq("id", userId)
    .maybeSingle();
  if (!data?.is_superadmin) redirect("/dashboard");
  return { userId, fullName: data.full_name, email: data.email };
});

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
}) {
  const { error } = await createAdminClient().from("superadmin_audit_logs").insert({
    admin_id: entry.adminId,
    action: entry.action,
    target_tenant_id: entry.tenantId ?? null,
    target_user_id: entry.userId ?? null,
    details: entry.details ?? {},
    ip_address: await requestIp(),
  });
  if (error) console.error("superadmin audit log failed:", error);
}
