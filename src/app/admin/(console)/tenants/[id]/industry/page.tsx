import { Suspense } from "react";
import type { Metadata } from "next";
import { TenantIndustryPanel } from "@/components/admin/tenant-industry-panel";
import { SettingsLoading } from "@/components/settings/shop-settings-section";
import { getTenantIndustryView } from "@/lib/admin-category-data";
import { tenantParam } from "@/lib/admin-params";

export const metadata: Metadata = { title: "Shop · Industry & modules" };

type Params = Promise<{ id: string }>;

async function Industry({ params }: { params: Params }) {
  const id = await tenantParam(params);
  return <TenantIndustryPanel tenantId={id} view={await getTenantIndustryView(id)} />;
}

/** Industry & modules tab (Phase 18, deliverables 2, 6 and RF-18.3): change the industry with a category remap, switch modules, see setup progress. */
export default function TenantIndustryPage({ params }: { params: Params }) {
  return (
    <Suspense fallback={<SettingsLoading />}>
      <Industry params={params} />
    </Suspense>
  );
}
