import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

// A suspended shop's user (Phase 13), a deactivated team member (Phase 14) or an archived organization's
// user (Phase 17), or an account with no shop at all, who is still signed in:
// end the session, then explain on /login.
export async function GET(request: NextRequest) {
  const supabase = await createClient();
  await supabase.auth.signOut({ scope: "local" });
  const asked = request.nextUrl.searchParams.get("reason");
  const reason = asked === "deactivated" || asked === "archived" || asked === "no_shop" ? asked : "suspended";
  return NextResponse.redirect(`${request.nextUrl.origin}/login?error=${reason}`);
}
