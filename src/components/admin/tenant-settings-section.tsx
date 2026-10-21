import { notFound } from "next/navigation";
import { shopSettingsValues } from "@/components/settings/shop-settings-section";
import { ShopSettingsForm, type SettingsSection } from "@/components/settings/shop-settings-form";
import { UnsavedSettings } from "@/components/settings/unsaved-settings";
import { tenantParam } from "@/lib/admin-params";
import { getTenantSettings } from "@/lib/tenant-settings-data";
import { timeZoneGroups } from "@/lib/timezones";

/** A console tab made of the organization's own shop-settings cards (saved to it, audited). Render in <Suspense>. */
export async function TenantSettingsSection({ params, sections, label }: { params: Promise<{ id: string }>; sections: SettingsSection[]; label: string }) {
  const tenant = await getTenantSettings(await tenantParam(params));
  if (!tenant) notFound();
  return (
    <UnsavedSettings>
      <ShopSettingsForm
        tenantId={tenant.id}
        sections={sections}
        label={label}
        canEdit
        timeZoneGroups={timeZoneGroups()}
        initial={shopSettingsValues(tenant)}
      />
    </UnsavedSettings>
  );
}
