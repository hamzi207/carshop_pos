import { Eye, ShieldAlert } from "lucide-react";
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
  const readOnly = session.mode === "read_only";
  return (
    <div className={`impersonation-banner${readOnly ? " is-read-only" : ""}`} role="status">
      {readOnly ? <Eye size={16} aria-hidden /> : <ShieldAlert size={16} aria-hidden />}
      <p>
        <strong>Superadmin{readOnly ? " · Read-only" : ""}:</strong> you&apos;re {readOnly ? "viewing" : "acting as"}{" "}
        <strong>{session.tenantName}</strong>.{" "}
        {readOnly ? "Nothing can be changed in this session." : "Everything you change is logged."}
        <span className="impersonation-ends"> Ends {adminDateTime(session.expiresAt)}.</span>
      </p>
      {/* A plain POST to a route: works in read-only sessions too. */}
      <form action="/auth/exit-impersonation" method="post">
        <button type="submit" className="button">Exit</button>
      </form>
    </div>
  );
}
