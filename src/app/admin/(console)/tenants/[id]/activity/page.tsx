import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { ActivityList } from "@/components/admin/activity-list";
import { getRecentActivity } from "@/lib/admin-data";
import { tenantParam } from "@/lib/admin-params";

export const metadata: Metadata = { title: "Shop · Activity" };

type Params = Promise<{ id: string }>;

async function Activity({ params }: { params: Params }) {
  const id = await tenantParam(params);
  const entries = await getRecentActivity(50, id);
  return (
    <section className="card admin-section">
      <div className="card-header">
        <div>
          <h2>Superadmin activity</h2>
          <p>The latest 50 things done to or as this organization</p>
        </div>
        <Link className="button" href={`/admin/audit?tenant=${id}`}>Full audit log</Link>
      </div>
      <ActivityList entries={entries} />
    </section>
  );
}

/** Activity tab: this organization's slice of the audit log. */
export default function TenantActivityPage({ params }: { params: Params }) {
  return (
    <Suspense fallback={<section className="card"><div className="empty-state">Loading…</div></section>}>
      <Activity params={params} />
    </Suspense>
  );
}
