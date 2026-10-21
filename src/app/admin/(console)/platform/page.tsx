import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { CarFront } from "lucide-react";
import { AnnouncementManager } from "@/components/admin/announcement-manager";
import { PlatformSettingsForm } from "@/components/admin/platform-settings-form";
import { getPlans } from "@/lib/plan-data";
import { getAnnouncements, getPlatformSettings, getTenantChoices } from "@/lib/platform-data";

export const metadata: Metadata = { title: "Platform" };

async function Settings() {
  const [initial, plans] = await Promise.all([getPlatformSettings(), getPlans()]);
  const choices = plans.filter((p) => p.visibility === "standard" && !p.retiredAt).map((p) => ({ id: p.id, name: p.name }));
  // Remounts with the saved values after each save.
  return <PlatformSettingsForm key={JSON.stringify(initial)} initial={initial} plans={choices} />;
}

async function Announcements() {
  const [rows, tenants] = await Promise.all([getAnnouncements(), getTenantChoices()]);
  return <AnnouncementManager rows={rows} tenants={tenants} />;
}

const Loading = () => <section className="card"><div className="empty-state">Loading…</div></section>;

/** /admin/platform (Phase 17, deliverable 5): platform-wide settings and announcements. */
export default function PlatformPage() {
  return (
    <div className="page settings-page">
      <div className="page-heading">
        <div>
          <span className="eyebrow">PLATFORM</span>
          <h1>Platform</h1>
          <p>Settings that apply to every organization: billing details, payment instructions, sign-up, email and announcements.</p>
        </div>
        <div className="heading-actions">
          <Link href="/admin/platform/vehicles" className="button"><CarFront size={14} /> Vehicle Catalog</Link>
        </div>
      </div>
      <div className="settings-form">
        <Suspense fallback={<Loading />}>
          <Announcements />
        </Suspense>
        <Suspense fallback={<Loading />}>
          <Settings />
        </Suspense>
      </div>
    </div>
  );
}
