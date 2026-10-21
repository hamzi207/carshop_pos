import { Suspense } from "react";
import type { Metadata } from "next";
import { SettingsLoading } from "@/components/settings/shop-settings-section";
import { SubscriptionSummary } from "@/components/subscription/subscription-summary";
import { getShopSession } from "@/lib/auth";
import { getMySubscription } from "@/lib/my-subscription-data";

export const metadata: Metadata = { title: "Settings · Subscription" };

async function SubscriptionContent() {
  const { role } = await getShopSession();
  const data = role === "admin" ? await getMySubscription() : null;
  if (!data) {
    return (
      <section className="card">
        <div className="empty-state">Only your organization&apos;s admins can see the subscription.</div>
      </section>
    );
  }
  return <SubscriptionSummary data={data} />;
}

/** What the organization pays ProductLogik (Phase 17, deliverable 9): read only, plus "I've paid". */
export default function SettingsSubscriptionPage() {
  return (
    <Suspense fallback={<SettingsLoading />}>
      <SubscriptionContent />
    </Suspense>
  );
}
