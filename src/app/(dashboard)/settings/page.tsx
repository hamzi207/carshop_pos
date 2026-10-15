import { Suspense } from "react";
import type { Metadata } from "next";
import { getShopSession } from "@/lib/auth";
import type { Currency } from "@/lib/validations/settings.schema";
import { ShopSettingsForm } from "@/components/settings/shop-settings-form";

export const metadata: Metadata = { title: "Settings" };

async function SettingsContent() {
  const { tenant, role } = await getShopSession();
  return (
    <ShopSettingsForm
      canEdit={role === "admin"}
      timezone={tenant.timezone}
      initial={{
        currency: tenant.currency as Currency,
        showPaisa: tenant.showPaisa,
        taxRate: tenant.taxRate,
        pricesIncludeTax: tenant.pricesIncludeTax,
        allowInternationalPhones: tenant.allowInternationalPhones,
      }}
    />
  );
}

export default function SettingsPage() {
  return (
    <div className="page settings-page">
      <div className="page-heading">
        <div>
          <span className="eyebrow">SHOP SETTINGS</span>
          <h1>Settings</h1>
          <p>Currency, tax, phone numbers and timezone for your shop.</p>
        </div>
      </div>
      <Suspense fallback={<section className="card"><div className="empty-state">Loading settings…</div></section>}>
        <SettingsContent />
      </Suspense>
    </div>
  );
}
