import { Suspense } from "react";
import type { Metadata } from "next";
import { getShopSession } from "@/lib/auth";
import { timeZoneGroups } from "@/lib/timezones";
import type { Currency } from "@/lib/validations/settings.schema";
import { formatPhone } from "@/lib/phone";
import { formatStrn } from "@/lib/tax-id";
import { ShopProfileForm } from "@/components/settings/shop-profile-form";
import { ShopSettingsForm } from "@/components/settings/shop-settings-form";

export const metadata: Metadata = { title: "Settings" };

async function SettingsContent() {
  const { tenant, role, fullName, email } = await getShopSession();
  const facts = [
    { label: "Shop handle", value: tenant.slug, mono: true },
    { label: "Shop ID", value: tenant.id, mono: true },
    { label: "Signed in as", value: `${fullName} · ${email}` },
    { label: "Your role", value: role === "admin" ? "Admin" : "Staff" },
  ];
  return (
    <div className="settings-form">
      <ShopProfileForm
        canEdit={role === "admin"}
        logoUrl={tenant.logoUrl}
        facts={facts}
        initial={{
          name: tenant.name,
          phone: formatPhone(tenant.phone),
          email: tenant.email ?? "",
          address: tenant.address ?? "",
          ntn: tenant.ntn ?? "",
          strn: formatStrn(tenant.strn),
          terms: tenant.quoteTerms ?? "",
        }}
      />
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
    </div>
  );
}

export default function SettingsPage() {
  return (
    <div className="page settings-page">
      <div className="page-heading">
        <div>
          <span className="eyebrow">SHOP SETTINGS</span>
          <h1>Settings</h1>
          <p>Your shop&apos;s details, currency, tax, phone numbers and timezone.</p>
        </div>
      </div>
      <Suspense fallback={<section className="card"><div className="empty-state">Loading settings…</div></section>}>
        <SettingsContent />
      </Suspense>
    </div>
  );
}
