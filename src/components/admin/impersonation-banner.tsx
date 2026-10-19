import { ShieldAlert } from "lucide-react";
import { endImpersonation } from "@/lib/actions/admin";
import { getImpersonation } from "@/lib/impersonation";
import { createClient } from "@/lib/supabase/server";
import { adminDateTime } from "./format";

/**
 * Shown on every page while a superadmin is acting as a shop ("Login As"), with Exit.
 * Reads cookies: render inside <Suspense>.
 */
export async function ImpersonationBanner() {
  const { data } = await (await createClient()).auth.getClaims();
  const userId = data?.claims?.sub;
  const session = userId ? await getImpersonation(userId) : null;
  if (!session) return null;
  return (
    <div className="impersonation-banner" role="status">
      <ShieldAlert size={16} aria-hidden />
      <p>
        <strong>Superadmin:</strong> you&apos;re acting as <strong>{session.tenantName}</strong>. Everything you change is logged.
        <span className="impersonation-ends"> Ends {adminDateTime(session.expiresAt)}.</span>
      </p>
      <form action={endImpersonation}>
        <button type="submit" className="button">Exit</button>
      </form>
    </div>
  );
}
