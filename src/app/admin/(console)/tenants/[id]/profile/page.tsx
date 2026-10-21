import { Suspense } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { SettingsLoading } from "@/components/settings/shop-settings-section";
import { ShopProfileForm } from "@/components/settings/shop-profile-form";
import { UnsavedSettings } from "@/components/settings/unsaved-settings";
import { tenantParam } from "@/lib/admin-params";
import { formatPhone } from "@/lib/phone";
import { formatStrn } from "@/lib/tax-id";
import { getTenantSettings } from "@/lib/tenant-settings-data";

export const metadata: Metadata = { title: "Shop · Profile" };

type Params = Promise<{ id: string }>;

async function Profile({ params }: { params: Params }) {
  const tenant = await getTenantSettings(await tenantParam(params));
  if (!tenant) notFound();
  return (
    <div className="settings-form">
      <UnsavedSettings>
        <ShopProfileForm
          tenantId={tenant.id}
          canEdit
          logoUrl={tenant.logoUrl}
          facts={[
            { label: "Shop handle", value: tenant.slug, mono: true },
            { label: "Shop ID", value: tenant.id, mono: true },
            { label: "Currency · timezone", value: `${tenant.currency} · ${tenant.timezone}` },
          ]}
          initial={{
            name: tenant.name,
            phone: formatPhone(tenant.phone),
            email: tenant.email ?? "",
            address: tenant.address ?? "",
            ntn: tenant.ntn ?? "",
            strn: formatStrn(tenant.strn),
            accentColor: tenant.accentColor ?? "",
          }}
        />
      </UnsavedSettings>
    </div>
  );
}

/** Profile tab: the organization's own Settings → Profile form, saved to it and audited. */
export default function TenantProfilePage({ params }: { params: Params }) {
  return (
    <Suspense fallback={<SettingsLoading />}>
      <Profile params={params} />
    </Suspense>
  );
}
