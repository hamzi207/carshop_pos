import "server-only";
import { requireSuperadmin } from "@/lib/superadmin";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Paged, Pagination } from "@/lib/pagination";
import type { Database } from "@/lib/types/database.types";
import { TENANT_STATUSES, type TenantStatus } from "@/lib/validations/admin.schema";

// Read side of /admin. Every loader checks requireSuperadmin() itself (pages may render them in
// parallel), then reads across all shops with the service role.

export type PlatformMetrics = {
  shops: { total: number; active: number; trial: number; suspended: number; newThisMonth: number };
  users: { total: number; active30: number };
  sales: { currency: string; total: number; thisMonth: number | null; collected: number; invoices: number }[];
  documents: { drafts: number; quotations: number; quotationsValue: number; invoices: number };
  signups: { month: string; count: number }[];
};

export async function getPlatformMetrics() {
  await requireSuperadmin();
  const { data, error } = await createAdminClient().rpc("admin_platform_metrics");
  if (error) throw new Error(`admin_platform_metrics: ${error.message}`);
  return data as unknown as PlatformMetrics;
}

export type ActivityEntry = {
  id: string;
  action: string;
  details: Record<string, unknown>;
  createdAt: string;
  adminName: string;
  tenantId: string | null;
  tenantName: string | null;
};

/** Latest superadmin actions, optionally for one shop. Request logs ("impersonation.request") are left out of the overview. */
export async function getRecentActivity(limit: number, tenantId?: string): Promise<ActivityEntry[]> {
  await requireSuperadmin();
  const admin = createAdminClient();
  let query = admin
    .from("superadmin_audit_logs")
    .select("id, action, details, created_at, admin_id, target_tenant_id, tenants(name)")
    .order("created_at", { ascending: false })
    .limit(limit);
  query = tenantId ? query.eq("target_tenant_id", tenantId) : query.neq("action", "impersonation.request");
  const { data } = await query;
  const rows = data ?? [];
  const adminIds = [...new Set(rows.map((r) => r.admin_id).filter((id): id is string => id !== null))];
  const { data: admins } = adminIds.length
    ? await admin.from("profiles").select("id, full_name").in("id", adminIds)
    : { data: [] as { id: string; full_name: string }[] };
  const names = new Map((admins ?? []).map((a) => [a.id, a.full_name]));
  return rows.map((r) => ({
    id: r.id,
    action: r.action,
    details: (r.details ?? {}) as Record<string, unknown>,
    createdAt: r.created_at,
    adminName: (r.admin_id && names.get(r.admin_id)) || "A superadmin",
    tenantId: r.target_tenant_id,
    tenantName: r.tenants?.name ?? null,
  }));
}

/** Newest shops, for the overview. */
export async function getNewestShops(limit: number) {
  await requireSuperadmin();
  const { data } = await createAdminClient().from("tenants").select("id, name, status, created_at").order("created_at", { ascending: false }).limit(limit);
  return data ?? [];
}

export type TenantRow = Database["public"]["Functions"]["admin_tenants"]["Returns"][number];

export async function getTenants(filters: { search: string; status: TenantStatus | null }, p: Pagination): Promise<Paged<TenantRow>> {
  await requireSuperadmin();
  const { data, error } = await createAdminClient().rpc("admin_tenants", {
    p_search: filters.search,
    p_status: filters.status as string,
    p_limit: p.limit,
    p_offset: (p.page - 1) * p.limit,
  });
  if (error) throw new Error(`admin_tenants: ${error.message}`);
  const rows = data ?? [];
  return { rows, total: Number(rows[0]?.total ?? 0), ...p };
}

export const parseTenantStatus = (v: string | undefined) => (TENANT_STATUSES.includes(v as TenantStatus) ? (v as TenantStatus) : null);

export type UserRow = Database["public"]["Functions"]["admin_users"]["Returns"][number];

export async function getUsers(search: string, p: Pagination): Promise<Paged<UserRow>> {
  await requireSuperadmin();
  const { data, error } = await createAdminClient().rpc("admin_users", {
    p_search: search,
    p_limit: p.limit,
    p_offset: (p.page - 1) * p.limit,
  });
  if (error) throw new Error(`admin_users: ${error.message}`);
  const rows = data ?? [];
  return { rows, total: Number(rows[0]?.total ?? 0), ...p };
}

/** One shop for /admin/tenants/[id]: the row, its people (with last sign-in) and its totals. */
export async function getTenantDetail(id: string) {
  await requireSuperadmin();
  const admin = createAdminClient();
  const { data: tenant } = await admin.from("tenants").select("*").eq("id", id).maybeSingle();
  if (!tenant) return null;
  const [{ data: members }, { data: stats }] = await Promise.all([
    admin.from("profiles").select("id, full_name, email, role, is_superadmin, created_at").eq("tenant_id", id).order("created_at"),
    admin.rpc("admin_tenants", { p_search: tenant.slug, p_status: null as unknown as string, p_limit: 1, p_offset: 0 }),
  ]);
  const signIns = new Map<string, string | null>();
  for (const m of members ?? []) {
    const { data } = await admin.auth.admin.getUserById(m.id);
    signIns.set(m.id, data.user?.last_sign_in_at ?? null);
  }
  const row = stats?.find((s) => s.id === id);
  return {
    tenant,
    members: (members ?? []).map((m) => ({ ...m, lastSignInAt: signIns.get(m.id) ?? null })),
    totals: { invoices: Number(row?.invoices ?? 0), sales: Number(row?.sales ?? 0), lastSignInAt: row?.last_sign_in_at ?? null },
  };
}
