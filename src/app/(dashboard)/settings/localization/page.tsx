import { Suspense } from "react";
import type { Metadata } from "next";
import { SettingsLoading, ShopSettingsSection } from "@/components/settings/shop-settings-section";

export const metadata: Metadata = { title: "Settings · Localization" };

export default function SettingsLocalizationPage() {
  return (
    <Suspense fallback={<SettingsLoading />}>
      <ShopSettingsSection sections={["currency", "phones", "timezone", "clock"]} label="Localization" />
    </Suspense>
  );
}
