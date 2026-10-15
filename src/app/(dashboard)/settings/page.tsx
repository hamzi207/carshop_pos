import { Suspense } from "react";
import type { Metadata } from "next";
import { getShopSession } from "@/lib/auth";
import { timeZoneGroups } from "@/lib/timezones";
import type { Currency } from "@/lib/validations/settings.schema";
import { ShopSettingsForm } from "@/components/settings/shop-settings-form";

export const metadata: Metadata = { title: "Settings" };

async function SettingsContent() {
  const { tenant, role } = await getShopSession();
  return (
    <ShopSettingsForm
      canEdit={role === "admin"}
      timeZoneGroups={timeZoneGroups()}
      initial={{
        timezone: tenant.timezone,
        showClock: tenant.showClock,
        clockStyle: tenant.clockStyle,
        clock24Hour: tenant.clock24Hour,
        weekStart: tenant.weekStart,
        quoteValidityDays: tenant.quoteValidityDays,
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
