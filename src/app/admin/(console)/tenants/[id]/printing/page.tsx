import { Suspense } from "react";
import type { Metadata } from "next";
import { TenantSettingsSection } from "@/components/admin/tenant-settings-section";
import { SettingsLoading } from "@/components/settings/shop-settings-section";

export const metadata: Metadata = { title: "Shop · Printing & POS" };

/** Printing & POS tab: the organization's own settings cards. */
export default function TenantPrintingPage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <Suspense fallback={<SettingsLoading />}>
      <TenantSettingsSection params={params} sections={["printFormat", "tax"]} label="Printing & POS" />
    </Suspense>
  );
}
