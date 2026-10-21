import "server-only";
import { peopleNames, requireSuperadmin } from "@/lib/superadmin";
import { createAdminClient } from "@/lib/supabase/admin";

// The organization page's Overview tab (Phase 17): health (RF-17.4), notes, tags and follow-ups
// (RF-17.2), owner and archive state. Service role, superadmin only.

export type HealthBand = "healthy" | "watch" | "at_risk";

export type Health = {
  score: number;
  band: HealthBand;
  parts: {
    signIns: { points: number; of: number; signedIn: number; activeUsers: number };
    activity: { points: number; of: number; documents30d: number };
    setup: { points: number; of: number; profile: boolean; logo: boolean; product: boolean; customer: boolean; invoice: boolean };
  };
};

export type AdminTag = { id: string; name: string; color: string };

export type TenantOverview = {
  health: Health | null;
  /** Daily snapshots, oldest first (last 90 days). */
  trend: { date: string; score: number }[];
  notes: { id: string; body: string; author: string; authorId: string | null; createdAt: string; editedAt: string | null }[];
  tags: AdminTag[];
  tagIds: string[];
  followUps: { id: string; dueOn: string; reason: string; by: string; doneAt: string | null; doneBy: string | null }[];
  owner: { id: string; name: string; email: string } | null;
  archive: { at: string; by: string; reason: string | null } | null;
};

export async function getTenantOverview(tenantId: string): Promise<TenantOverview | null> {
  await requireSuperadmin();
  const admin = createAdminClient();
  const { data: tenant } = await admin.from("tenants").select("owner_id, archived_at, archived_by, archive_reason").eq("id", tenantId).maybeSingle();
  if (!tenant) return null;
  const since = new Date(Date.now() - 90 * 86_400_000).toISOString().slice(0, 10);
  const [health, trend, notes, tags, tenantTags, followUps] = await Promise.all([
    tenant.archived_at ? Promise.resolve({ data: null }) : admin.rpc("admin_tenant_health", { p_tenant: tenantId }),
    admin.from("tenant_health_snapshots").select("taken_on, score").eq("tenant_id", tenantId).gte("taken_on", since).order("taken_on"),
    admin.from("tenant_notes").select("id, body, author_id, created_at, edited_at").eq("tenant_id", tenantId).is("deleted_at", null).order("created_at", { ascending: false }),
    admin.from("admin_tags").select("id, name, color").order("name"),
    admin.from("tenant_tags").select("tag_id").eq("tenant_id", tenantId),
    admin.from("tenant_follow_ups").select("id, due_on, reason, created_by, done_at, done_by").eq("tenant_id", tenantId).order("done_at", { ascending: false, nullsFirst: true }).order("due_on").limit(30),
  ]);

  // Names of everyone referenced (superadmins and shop users; both keyed by auth user id).
  const ids = new Set<string>();
  for (const n of notes.data ?? []) if (n.author_id) ids.add(n.author_id);
  for (const f of followUps.data ?? []) {
    if (f.created_by) ids.add(f.created_by);
    if (f.done_by) ids.add(f.done_by);
  }
  if (tenant.archived_by) ids.add(tenant.archived_by);
  if (tenant.owner_id) ids.add(tenant.owner_id);
  const person = await peopleNames([...ids]);
  const nameOf = (uid: string | null) => (uid && person.get(uid)?.fullName) || "A former superadmin";
  const owner = tenant.owner_id ? person.get(tenant.owner_id) : undefined;

  return {
    health: (health.data as Health | null) ?? null,
    trend: (trend.data ?? []).map((t) => ({ date: t.taken_on, score: t.score })),
    notes: (notes.data ?? []).map((n) => ({ id: n.id, body: n.body, author: nameOf(n.author_id), authorId: n.author_id, createdAt: n.created_at, editedAt: n.edited_at })),
    tags: tags.data ?? [],
    tagIds: (tenantTags.data ?? []).map((t) => t.tag_id),
    followUps: (followUps.data ?? []).map((f) => ({
      id: f.id,
      dueOn: f.due_on,
      reason: f.reason,
      by: nameOf(f.created_by),
      doneAt: f.done_at,
      doneBy: f.done_by ? nameOf(f.done_by) : null,
    })),
    owner: owner && tenant.owner_id ? { id: tenant.owner_id, name: owner.fullName, email: owner.email } : null,
    archive: tenant.archived_at ? { at: tenant.archived_at, by: nameOf(tenant.archived_by), reason: tenant.archive_reason } : null,
  };
}
