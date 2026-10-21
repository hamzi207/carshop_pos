import { Suspense } from "react";
import type { Metadata } from "next";
import { PlanManager } from "@/components/admin/plan-manager";
import { getPlans } from "@/lib/plan-data";

export const metadata: Metadata = { title: "Plans" };

async function Plans() {
  return <PlanManager plans={await getPlans()} />;
}

/** Subscription plans (Phase 17, deliverable 9): data the superadmin edits, never code. */
export default function PlansPage() {
  return (
    <div className="page">
      <div className="page-heading">
        <div>
          <span className="eyebrow">SUBSCRIPTIONS</span>
          <h1>Plans</h1>
          <p>What organizations pay ProductLogik: prices per cycle, limits, modules and trial days.</p>
        </div>
      </div>
      <Suspense fallback={<section className="card"><div className="empty-state">Loading plans…</div></section>}>
        <Plans />
      </Suspense>
    </div>
  );
}
