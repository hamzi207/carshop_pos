import { Suspense } from "react";
import type { Metadata } from "next";
import { Store } from "lucide-react";
import { getShopSession } from "@/lib/auth";
import { timeZoneGroups } from "@/lib/timezones";
import type { Currency } from "@/lib/validations/settings.schema";
import { ShopSettingsForm } from "@/components/settings/shop-settings-form";

export const metadata: Metadata = { title: "Settings" };

async function SettingsContent() {
  const { tenant, role, fullName, email } = await getShopSession();
  const details = [
    { label: "Shop name", value: tenant.name },
    { label: "Shop handle", value: tenant.slug, mono: true },
    { label: "Shop ID", value: tenant.id, mono: true },
    { label: "Signed in as", value: `${fullName} · ${email}` },
    { label: "Your role", value: role === "admin" ? "Admin" : "Staff" },
  ];
  return (
    <div className="settings-form">
      <section className="card settings-card">
        <div className="settings-card-head">
          <span className="header-icon blue"><Store size={18} /></span>
          <div>
            <h2>Your shop</h2>
            <p>The shop you&apos;re signed in to.</p>
          </div>
        </div>
        {details.map((d) => (
          <div key={d.label} className="settings-row">
            <span className="settings-label">{d.label}</span>
            <span className={d.mono ? "settings-value mono" : "settings-value"}>{d.value}</span>
          </div>
        ))}
      </section>
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
