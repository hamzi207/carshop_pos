import "server-only";
import { cache } from "react";
import { peopleNames, requireSuperadmin } from "@/lib/superadmin";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Paged, Pagination } from "@/lib/pagination";
import type { Database } from "@/lib/types/database.types";
import { billingToday } from "@/lib/subscription";
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
  const names = await peopleNames(adminIds);
  return rows.map((r) => ({
    id: r.id,
    action: r.action,
    details: (r.details ?? {}) as Record<string, unknown>,
    createdAt: r.created_at,
    adminName: (r.admin_id && names.get(r.admin_id)?.fullName) || "A superadmin",
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

export const TENANT_SORTS = ["newest", "name", "health", "last_sign_in", "sales", "due", "archived"] as const;
export type TenantSort = (typeof TENANT_SORTS)[number];
export const HEALTH_BANDS = ["healthy", "watch", "at_risk"] as const;

export type TenantFilters = {
  search: string;
  status: TenantStatus | null;
  /** The archive instead of live organizations (Phase 17). */
  archived: boolean;
  tag: string | null;
  band: (typeof HEALTH_BANDS)[number] | null;
  sort: TenantSort;
};

export async function getTenants(filters: TenantFilters, p: Pagination): Promise<Paged<TenantRow>> {
  await requireSuperadmin();
  const { data, error } = await createAdminClient().rpc("admin_tenants", {
    p_search: filters.search,
    p_status: filters.status as string,
    p_limit: p.limit,
    p_offset: (p.page - 1) * p.limit,
    p_archived: filters.archived,
    p_tag: filters.tag as string,
    p_band: filters.band as string,
    p_sort: filters.sort,
  });
  if (error) throw new Error(`admin_tenants: ${error.message}`);
  const rows = data ?? [];
  return { rows, total: Number(rows[0]?.total ?? 0), ...p };
}

/** Every admin tag, for filters and pickers. */
export async function getAdminTags() {
  await requireSuperadmin();
  const { data } = await createAdminClient().from("admin_tags").select("id, name, color").order("name");
  return data ?? [];
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

/** One shop for /admin/tenants/[id]: the row, its people (with last sign-in) and its totals. Cached per request (layout + tab). */
export const getTenantDetail = cache(async (id: string) => {
  await requireSuperadmin();
  const admin = createAdminClient();
  const { data: tenant } = await admin.from("tenants").select("*").eq("id", id).maybeSingle();
  if (!tenant) return null;
  const [{ data: members }, { data: stats }] = await Promise.all([
    admin.from("profiles").select("id, full_name, email, role, created_at").eq("tenant_id", id).order("created_at"),
    admin.rpc("admin_tenants", { p_search: tenant.slug, p_status: null as unknown as string, p_limit: 1, p_offset: 0, p_archived: tenant.archived_at !== null }),
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
});

export type SuperadminRow = {
  id: string;
  fullName: string;
  email: string;
  lastSignInAt: string | null;
  /** Verified two-factor apps (0 = sets one up at next sign-in). */
  factors: number;
};

/** /admin/team: every active superadmin account. */
export async function getSuperadmins(): Promise<SuperadminRow[]> {
  await requireSuperadmin();
  const admin = createAdminClient();
  const { data } = await admin.from("platform_admins").select("id, full_name, email").is("removed_at", null).order("full_name");
  return Promise.all(
    (data ?? []).map(async (p) => {
      const [{ data: user }, { data: mfa }] = await Promise.all([
        admin.auth.admin.getUserById(p.id),
        admin.auth.admin.mfa.listFactors({ userId: p.id }),
      ]);
      return {
        id: p.id,
        fullName: p.full_name,
        email: p.email,
        lastSignInAt: user.user?.last_sign_in_at ?? null,
        factors: (mfa?.factors ?? []).filter((f) => f.status === "verified").length,
      };
    }),
  );
}

export type Attention = {
  today: string;
  followUps: { id: string; tenantId: string; tenantName: string; dueOn: string; reason: string }[];
  atRisk: { id: string; name: string; score: number | null }[];
  nearLimits: { tenantId: string; name: string; kind: string; used: number; max: number }[];
};

/** Overview → Needs attention (Phase 17, deliverable 8): follow-ups due, at-risk health, near plan limits. */
export async function getAttention(): Promise<Attention> {
  await requireSuperadmin();
  // After the session read: the date is request-time data.
  const today = billingToday();
  const admin = createAdminClient();
  const [followUps, atRisk, near] = await Promise.all([
    admin.from("tenant_follow_ups").select("id, tenant_id, due_on, reason, tenants!inner(name, archived_at)").is("done_at", null).lte("due_on", today).is("tenants.archived_at", null).order("due_on").limit(10),
    admin.rpc("admin_tenants", { p_search: "", p_status: null as unknown as string, p_limit: 6, p_offset: 0, p_band: "at_risk", p_sort: "health" }),
    admin.rpc("admin_near_limits", {}),
  ]);
  return {
    today,
    followUps: (followUps.data ?? []).map((f) => ({ id: f.id, tenantId: f.tenant_id, tenantName: f.tenants.name, dueOn: f.due_on, reason: f.reason })),
    atRisk: (atRisk.data ?? []).map((t) => ({ id: t.id, name: t.name, score: t.health_score })),
    nearLimits: (near.data ?? []).slice(0, 8).map((n) => ({ tenantId: n.tenant_id, name: n.name, kind: n.kind, used: Number(n.used), max: n.max })),
  };
}

export const VEHICLE_SCOPES = { all: "Everything", catalog: "Catalog", shops: "Added by shops", inactive: "Deactivated" } as const;
export type VehicleScope = keyof typeof VEHICLE_SCOPES;
export type VehicleRow = Database["public"]["Functions"]["admin_vehicles"]["Returns"][number];

/** /admin/platform/vehicles: the catalog, searched and paged in SQL. */
export async function getVehicles(f: { search: string; year: number | null; scope: VehicleScope }, p: Pagination): Promise<Paged<VehicleRow>> {
  await requireSuperadmin();
  const { data, error } = await createAdminClient().rpc("admin_vehicles", {
    p_query: f.search,
    p_year: f.year as number,
    p_scope: f.scope,
    p_limit: p.limit,
    p_offset: (p.page - 1) * p.limit,
  });
  if (error) throw new Error(`admin_vehicles: ${error.message}`);
  const rows = data ?? [];
  return { rows, total: Number(rows[0]?.total ?? 0), ...p };
}
