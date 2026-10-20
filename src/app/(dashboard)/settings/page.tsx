import { Suspense } from "react";
import type { Metadata } from "next";
import { getShopSession } from "@/lib/auth";
import { formatPhone } from "@/lib/phone";
import { formatStrn } from "@/lib/tax-id";
import { ShopProfileForm } from "@/components/settings/shop-profile-form";
import { SettingsLoading } from "@/components/settings/shop-settings-section";
import { UnsavedSettings } from "@/components/settings/unsaved-settings";

export const metadata: Metadata = { title: "Settings · Profile" };

async function ProfileContent() {
  const { tenant, role, fullName, email } = await getShopSession();
  const facts = [
    { label: "Shop handle", value: tenant.slug, mono: true },
    { label: "Shop ID", value: tenant.id, mono: true },
    { label: "Signed in as", value: `${fullName} · ${email}` },
    { label: "Your role", value: role === "admin" ? "Admin" : "Staff" },
  ];
  return (
    // UnsavedSettings: one Save Settings bar; nothing saves until it's pressed.
    <div className="settings-form">
      <UnsavedSettings>
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
            accentColor: tenant.accentColor ?? "",
          }}
        />
      </UnsavedSettings>
    </div>
  );
}

export default function SettingsProfilePage() {
  return (
    <Suspense fallback={<SettingsLoading />}>
      <ProfileContent />
    </Suspense>
  );
}
