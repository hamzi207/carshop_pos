import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import type { TeamRole } from "@/lib/validations/team.schema";

export type TeamMemberStatus = "active" | "invited" | "deactivated";

export type TeamMember = {
  id: string;
  fullName: string;
  email: string;
  role: TeamRole;
  status: TeamMemberStatus;
  lastSignInAt: string | null;
  joinedAt: string;
};

/**
 * Settings → Team: the shop's members. Sign-in times live in Supabase Auth, so this uses the
 * service role, pinned to `tenantId` (the caller's shop from getShopSession()). "Invited" = has
 * never signed in (the invitation link signs them in).
 */
export async function getTeam(tenantId: string): Promise<TeamMember[]> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("profiles")
    .select("id, full_name, email, role, deactivated_at, created_at")
    .eq("tenant_id", tenantId)
    .order("created_at");
  if (error) {
    console.error("getTeam failed:", error.message);
    throw new Error("Could not load the team.");
  }
  const signIns = await Promise.all(
    data.map(async (m) => (await admin.auth.admin.getUserById(m.id)).data.user?.last_sign_in_at ?? null),
  );
  return data.map((m, i) => ({
    id: m.id,
    fullName: m.full_name,
    email: m.email,
    role: m.role === "admin" ? "admin" : "staff",
    status: m.deactivated_at ? "deactivated" : signIns[i] ? "active" : "invited",
    lastSignInAt: signIns[i],
    joinedAt: m.created_at,
  }));
}
