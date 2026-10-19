import { Suspense } from "react";
import type { Metadata } from "next";
import { SettingsLoading, ShopSettingsSection } from "@/components/settings/shop-settings-section";

export const metadata: Metadata = { title: "Settings · POS" };

export default function SettingsPosPage() {
  return (
    <Suspense fallback={<SettingsLoading />}>
      <ShopSettingsSection sections={["tax"]} label="POS" />
    </Suspense>
  );
}
