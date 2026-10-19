import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

// A suspended shop's user (Phase 13) or a deactivated team member (Phase 14) who is still signed in:
// end the session, then explain on /login.
export async function GET(request: NextRequest) {
  const supabase = await createClient();
  await supabase.auth.signOut({ scope: "local" });
  const reason = request.nextUrl.searchParams.get("reason") === "deactivated" ? "deactivated" : "suspended";
  return NextResponse.redirect(`${request.nextUrl.origin}/login?error=${reason}`);
}
