import { Suspense } from "react";
import type { Metadata } from "next";
import { SettingsLoading, ShopSettingsSection } from "@/components/settings/shop-settings-section";

export const metadata: Metadata = { title: "Settings · Printing" };

export default function SettingsPrintingPage() {
  return (
    <Suspense fallback={<SettingsLoading />}>
      <ShopSettingsSection sections={["printFormat"]} label="Printing" />
    </Suspense>
  );
}
