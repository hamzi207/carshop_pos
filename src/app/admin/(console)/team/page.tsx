import { Suspense } from "react";
import type { Metadata } from "next";
import { PlatformTeam } from "@/components/admin/platform-team";
import { getSuperadmins } from "@/lib/admin-data";
import { requireSuperadmin } from "@/lib/superadmin";

export const metadata: Metadata = { title: "Team" };

async function Team() {
  const [me, rows] = await Promise.all([requireSuperadmin(), getSuperadmins()]);
  return <PlatformTeam rows={rows} meId={me.userId} />;
}

/** /admin/team (Phase 17): the platform's superadmins. */
export default function TeamPage() {
  return (
    <div className="page">
      <div className="page-heading">
        <div>
          <span className="eyebrow">PLATFORM</span>
          <h1>Team</h1>
          <p>The people who run ProductLogik Invoicing System. Every grant, removal and two-factor reset is audited.</p>
        </div>
      </div>
      <Suspense fallback={<section className="card"><div className="empty-state">Loading…</div></section>}>
        <Team />
      </Suspense>
    </div>
  );
}
