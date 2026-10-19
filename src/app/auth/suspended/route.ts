import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

// A suspended shop's user who is still signed in (Phase 13): end the session, then explain on /login.
export async function GET(request: NextRequest) {
  const supabase = await createClient();
  await supabase.auth.signOut({ scope: "local" });
  return NextResponse.redirect(`${request.nextUrl.origin}/login?error=suspended`);
}
