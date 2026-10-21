import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ActivityList } from "@/components/admin/activity-list";
import { adminDate } from "@/components/admin/format";
import { TenantFollowUps, TenantNotes, TenantTagsCard } from "@/components/admin/tenant-crm";
import { TenantDangerZone } from "@/components/admin/tenant-danger-zone";
import { HealthCard } from "@/components/admin/tenant-health";
import { getRecentActivity, getTenantDetail } from "@/lib/admin-data";
import { tenantParam } from "@/lib/admin-params";
import { requireSuperadmin } from "@/lib/superadmin";
import { getTenantOverview } from "@/lib/tenant-overview-data";
import { formatPhone } from "@/lib/phone";

export const metadata: Metadata = { title: "Shop" };

type Params = Promise<{ id: string }>;

async function TenantOverview({ params }: { params: Params }) {
  const id = await tenantParam(params);
  const [me, detail, overview, activity] = await Promise.all([requireSuperadmin(), getTenantDetail(id), getTenantOverview(id), getRecentActivity(8, id)]);
  if (!detail || !overview) notFound();
  const { tenant } = detail;

  return (
    <div className="tenant-overview">
      <div className="tenant-overview-main">
        <section className="card admin-section">
          <div className="card-header">
            <div>
              <h2>Summary</h2>
              <p>{tenant.status === "suspended" && tenant.status_reason ? `Suspended: ${tenant.status_reason}` : "Who owns it and how to reach them."}</p>
            </div>
          </div>
          <dl className="tenant-facts">
            <div><dt>Owner</dt><dd>{overview.owner ? <>{overview.owner.name}<small>{overview.owner.email}</small></> : "No owner"}</dd></div>
            <div><dt>Contact</dt><dd>{tenant.phone ? formatPhone(tenant.phone) : "No phone"}<small>{tenant.email ?? "No email"}</small></dd></div>
            <div><dt>Handle</dt><dd className="mono">{tenant.slug}</dd></div>
            <div><dt>Created</dt><dd>{adminDate(tenant.created_at)}</dd></div>
          </dl>
        </section>
        <HealthCard health={overview.health} trend={overview.trend} />
        <TenantNotes tenantId={id} notes={overview.notes} meId={me.userId} />
        <section className="card admin-section">
          <div className="card-header">
            <div>
              <h2>Recent activity</h2>
              <p>The latest superadmin actions on this organization</p>
            </div>
            <Link className="button" href={`/admin/tenants/${id}/activity`}>All activity</Link>
          </div>
          <ActivityList entries={activity} />
        </section>
      </div>
      <div className="tenant-overview-side">
        <TenantTagsCard tenantId={id} tags={overview.tags} tagIds={overview.tagIds} />
        <TenantFollowUps tenantId={id} followUps={overview.followUps} />
        <TenantDangerZone tenantId={id} name={tenant.name} archive={overview.archive} />
      </div>
    </div>
  );
}

/** Overview tab: summary, health, notes, tags, follow-ups, archive (Phase 17). Settings live in the other tabs. */
export default function TenantPage({ params }: { params: Params }) {
  return (
    <Suspense fallback={<section className="card"><div className="empty-state">Loading…</div></section>}>
      <TenantOverview params={params} />
    </Suspense>
  );
}
