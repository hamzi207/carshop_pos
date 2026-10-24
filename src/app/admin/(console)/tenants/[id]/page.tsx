import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Blocks, CalendarClock, CreditCard, ListChecks } from "lucide-react";
import { ActivityList } from "@/components/admin/activity-list";
import { adminDate } from "@/components/admin/format";
import { Stat } from "@/components/admin/stat";
import { TenantFollowUps, TenantNotes, TenantTagsCard } from "@/components/admin/tenant-crm";
import { TenantDangerZone } from "@/components/admin/tenant-danger-zone";
import { HealthCard } from "@/components/admin/tenant-health";
import { getTenantSetupSummary } from "@/lib/admin-category-data";
import { getRecentActivity, getTenantDetail } from "@/lib/admin-data";
import { tenantParam } from "@/lib/admin-params";
import { modulesText } from "@/lib/modules";
import { formatPhone } from "@/lib/phone";
import { badgeOf, billingDate, CYCLE_LABEL, pkr, SUBSCRIPTION_STATUS } from "@/lib/subscription";
import { getTenantSubscription } from "@/lib/subscription-data";
import { requireSuperadmin } from "@/lib/superadmin";
import { getTenantOverview } from "@/lib/tenant-overview-data";

export const metadata: Metadata = { title: "Organization" };

type Params = Promise<{ id: string }>;

async function TenantOverview({ params }: { params: Params }) {
  const id = await tenantParam(params);
  const [me, detail, overview, activity, sub, setup] = await Promise.all([
    requireSuperadmin(),
    getTenantDetail(id),
    getTenantOverview(id),
    getRecentActivity(8, id),
    getTenantSubscription(id),
    getTenantSetupSummary(id),
  ]);
  if (!detail || !overview) notFound();
  const { tenant } = detail;
  const status = sub ? badgeOf(SUBSCRIPTION_STATUS, sub.status) : null;
  const base = `/admin/tenants/${id}`;

  return (
    <>
      <div className="stat-grid tenant-stats">
        <Link href={`${base}/subscription`} className="stat-link">
          <Stat
            tone="blue"
            icon={<CreditCard size={16} />}
            title="Subscription"
            value={sub ? sub.planName : "None"}
            detail={sub ? `${status!.label} · ${CYCLE_LABEL[sub.cycle]} · ${pkr(sub.price.net)}` : "No plan assigned"}
          />
        </Link>
        <Link href={`${base}/subscription`} className="stat-link">
          <Stat
            tone={sub?.status === "past_due" || sub?.status === "suspended" ? "red" : "amber"}
            icon={<CalendarClock size={16} />}
            title={sub?.status === "trial" ? "Trial ends" : "Next due"}
            value={sub ? billingDate(sub.status === "trial" ? sub.trialEndsAt : sub.nextDueDate) : "—"}
            detail={sub ? `Started ${billingDate(sub.startedAt)} · paid until ${sub.paidUntil ? billingDate(sub.paidUntil) : "nothing yet"}` : ""}
          />
        </Link>
        <Link href={`${base}/industry`} className="stat-link">
          <Stat tone="purple" icon={<Blocks size={16} />} title="Industry" value={setup.industryName} detail={`Modules: ${modulesText(setup.modules)}`} />
        </Link>
        <Link href={`${base}/industry`} className="stat-link">
          <Stat
            tone="green"
            icon={<ListChecks size={16} />}
            title="Setup"
            value={setup.total ? `${Math.round((setup.done / setup.total) * 100)}%` : "—"}
            detail={`${setup.done} of ${setup.total} steps${setup.dismissed ? " · checklist hidden by them" : ""}`}
          />
        </Link>
      </div>

      <div className="tenant-overview">
        <div className="tenant-overview-main">
          <section className="card admin-section">
            <div className="card-header">
              <div>
                <h2>Summary</h2>
                <p>{tenant.status === "suspended" && tenant.status_reason ? `Suspended: ${tenant.status_reason}` : "Who owns it and how to reach them."}</p>
              </div>
              <Link className="button" href={`${base}/profile`}>Edit details</Link>
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
              <Link className="button" href={`${base}/activity`}>All activity</Link>
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
    </>
  );
}

/** Overview tab: key figures, summary, health, notes, tags, follow-ups, archive (Phase 17–18). Settings live in the other tabs. */
export default function TenantPage({ params }: { params: Params }) {
  return (
    <Suspense fallback={<section className="card"><div className="empty-state">Loading…</div></section>}>
      <TenantOverview params={params} />
    </Suspense>
  );
}
