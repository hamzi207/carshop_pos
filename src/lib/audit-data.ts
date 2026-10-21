import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { pageRange, type Paged, type Pagination } from "@/lib/pagination";
import { peopleNames, requireSuperadmin } from "@/lib/superadmin";

// /admin/audit (Phase 17, deliverable 7): every superadmin action and impersonated request, from
// superadmin_audit_logs. Each organization's Activity tab links here with ?tenant=.

export const AUDIT_GROUPS = {
  tenant: "Organizations",
  user: "Users",
  subscription: "Subscriptions",
  plan: "Plans",
  impersonation: "Login As",
  superadmin: "Platform team",
  category: "Categories",
  platform: "Platform settings",
  announcement: "Announcements",
  tag: "Tags",
  vehicle: "Vehicle catalog",
} as const;
export type AuditGroup = keyof typeof AUDIT_GROUPS;

export const AUDIT_PERIODS = { "7": "Last 7 days", "30": "Last 30 days", "90": "Last 90 days", "365": "Last year" } as const;

export type AuditFilters = {
  tenantId: string | null;
  adminId: string | null;
  group: AuditGroup | null;
  /** Days back; null = all time. */
  days: number | null;
  /** Matches the action name (e.g. "archive"). */
  search: string;
};

export type AuditEntry = {
  id: string;
  createdAt: string;
  action: string;
  details: Record<string, unknown>;
  reason: string | null;
  ip: string | null;
  adminName: string;
  tenantId: string | null;
  tenantName: string | null;
  userEmail: string | null;
};

function filtered(f: AuditFilters) {
  let q = createAdminClient()
    .from("superadmin_audit_logs")
    .select("id, created_at, action, details, reason, ip_address, admin_id, target_tenant_id, target_user_id, tenants(name)", { count: "exact" })
    .order("created_at", { ascending: false });
  if (f.tenantId) q = q.eq("target_tenant_id", f.tenantId);
  if (f.adminId) q = q.eq("admin_id", f.adminId);
  if (f.group) q = q.like("action", `${f.group}.%`);
  if (f.search) q = q.ilike("action", `%${f.search.replace(/[%_\\]/g, "")}%`);
  if (f.days) q = q.gte("created_at", new Date(Date.now() - f.days * 86_400_000).toISOString());
  return q;
}

type Row = { id: string; created_at: string; action: string; details: unknown; reason: string | null; ip_address: unknown; admin_id: string | null; target_tenant_id: string | null; target_user_id: string | null; tenants: { name: string } | null };

async function toEntries(rows: Row[]): Promise<AuditEntry[]> {
  const names = await peopleNames(rows.flatMap((r) => [r.admin_id, r.target_user_id].filter((v): v is string => v !== null)));
  return rows.map((r) => ({
    id: r.id,
    createdAt: r.created_at,
    action: r.action,
    details: (r.details ?? {}) as Record<string, unknown>,
    reason: r.reason,
    ip: r.ip_address ? String(r.ip_address) : null,
    adminName: (r.admin_id && names.get(r.admin_id)?.fullName) || "A former superadmin",
    tenantId: r.target_tenant_id,
    tenantName: r.tenants?.name ?? null,
    userEmail: (r.target_user_id && names.get(r.target_user_id)?.email) || null,
  }));
}

export async function getAuditLog(f: AuditFilters, p: Pagination): Promise<Paged<AuditEntry>> {
  await requireSuperadmin();
  const { from, to } = pageRange(p);
  const { data, count, error } = await filtered(f).range(from, to);
  if (error && error.code !== "PGRST103") throw new Error(`audit log: ${error.message}`);
  return { rows: await toEntries((data ?? []) as Row[]), total: count ?? 0, ...p };
}

/** The CSV export: the same filters, newest 10,000 rows. */
export async function getAuditExport(f: AuditFilters) {
  await requireSuperadmin();
  const { data, error } = await filtered(f).limit(10_000);
  if (error) throw new Error(`audit export: ${error.message}`);
  return toEntries((data ?? []) as Row[]);
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** ?tenant= &admin= &group= &days= &q= from the URL (invalid values are ignored). */
export function parseAuditFilters(get: (key: string) => string | undefined): AuditFilters {
  const group = get("group");
  const days = get("days");
  return {
    tenantId: UUID.test(get("tenant") ?? "") ? get("tenant")! : null,
    adminId: UUID.test(get("admin") ?? "") ? get("admin")! : null,
    group: group && group in AUDIT_GROUPS ? (group as AuditGroup) : null,
    days: days && days in AUDIT_PERIODS ? Number(days) : null,
    search: (get("q") ?? "").trim().slice(0, 60),
  };
}
