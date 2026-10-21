import { Suspense } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { TenantSubscriptionPanel } from "@/components/admin/tenant-subscription-panel";
import { getTenantDetail } from "@/lib/admin-data";
import { getPlans } from "@/lib/plan-data";
import { getTenantSubscription } from "@/lib/subscription-data";

export const metadata: Metadata = { title: "Shop · Subscription" };

type Params = Promise<{ id: string }>;

async function Subscription({ params }: { params: Params }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const [detail, sub, plans] = await Promise.all([getTenantDetail(id), getTenantSubscription(id), getPlans()]);
  if (!detail) notFound();
  if (!sub) {
    return (
      <section className="card admin-section">
        <div className="empty-state">This organization has no subscription. Set a sign-up default plan in Platform settings.</div>
      </section>
    );
  }
  return <TenantSubscriptionPanel sub={sub} plans={plans} tenantName={detail.tenant.name} />;
}

/** Subscription tab (Phase 17, deliverable 9): plan, price, limits, invoices, payments and history. */
export default function TenantSubscriptionPage({ params }: { params: Params }) {
  return (
    <Suspense fallback={<section className="card"><div className="empty-state">Loading subscription…</div></section>}>
      <Subscription params={params} />
    </Suspense>
  );
}
