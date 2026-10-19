import { Suspense } from "react";
import type { Metadata } from "next";
import { getShopSession } from "@/lib/auth";
import { formatDate } from "@/lib/format";
import { getTeam } from "@/lib/team-data";
import { SettingsLoading } from "@/components/settings/shop-settings-section";
import { TeamManager } from "@/components/settings/team-manager";

export const metadata: Metadata = { title: "Settings · Team" };

async function TeamContent() {
  const { tenant, role, userId } = await getShopSession();
  const members = await getTeam(tenant.id);
  return (
    <TeamManager
      meId={userId}
      canEdit={role === "admin"}
      members={members.map((m) => ({
        id: m.id,
        fullName: m.fullName,
        email: m.email,
        role: m.role,
        status: m.status,
        lastSignIn: m.lastSignInAt ? formatDate(m.lastSignInAt, tenant.timezone) : "Never",
      }))}
    />
  );
}

export default function SettingsTeamPage() {
  return (
    <Suspense fallback={<SettingsLoading />}>
      <TeamContent />
    </Suspense>
  );
}
