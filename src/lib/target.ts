import "server-only";
import { getShopSession } from "@/lib/auth";
import { audit, changedFields, requireSuperadmin } from "@/lib/superadmin";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import type { Tables } from "@/lib/types/database.types";

/**
 * Whose organization a settings action changes (Phase 17, decision 13: superadmin parity).
 * - No `tenantId`: the caller's own organization, as one of its admins, through RLS (a superadmin
 *   acting as it with "Login As" counts as its admin).
 * - With `tenantId`: any organization, for a signed-in superadmin (two-factor) on /admin, with the
 *   service role. Pass the result to `auditTarget()` after saving so the change is logged.
 * One implementation per setting, so the console and the organization's own Settings can't disagree.
 */
export async function resolveTarget(tenantId: string | undefined, forbidden: string) {
  if (tenantId) {
    const me = await requireSuperadmin();
    if (!/^[0-9a-f-]{36}$/i.test(tenantId)) return { ok: false, message: "That organization wasn't found." } as const;
    const client = createAdminClient();
    const { data } = await client.from("tenants").select("*").eq("id", tenantId).maybeSingle();
    if (!data) return { ok: false, message: "That organization wasn't found." } as const;
    return {
      ok: true,
      client,
      tenantId: data.id,
      tenantName: data.name,
      allowInternationalPhones: data.allow_international_phones,
      adminId: me.userId as string | null,
      actorName: me.fullName,
      before: data as Tables<"tenants"> | null,
    } as const;
  }
  const session = await getShopSession();
  if (session.role !== "admin") return { ok: false, message: forbidden } as const;
  return {
    ok: true,
    client: await createClient(),
    tenantId: session.tenant.id,
    tenantName: session.tenant.name,
    allowInternationalPhones: session.tenant.allowInternationalPhones,
    adminId: null as string | null,
    actorName: session.fullName,
    before: null as Tables<"tenants"> | null,
  } as const;
}

export type Target = Extract<Awaited<ReturnType<typeof resolveTarget>>, { ok: true }>;

/** Audit row for a superadmin change made through resolveTarget(); no-op for the organization's own admins. */
export async function auditTarget(target: Target, action: string, after: Record<string, unknown>) {
  if (!target.adminId || !target.before) return;
  const diff = changedFields(target.before as unknown as Record<string, unknown>, after);
  if (Object.keys(diff.after).length === 0) return;
  await audit({ adminId: target.adminId, action, tenantId: target.tenantId, details: diff });
}
