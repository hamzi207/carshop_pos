import type { EmailOtpType } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

const TYPES: EmailOtpType[] = ["recovery", "invite"];

// Landing point for the one-time links a superadmin sends (Phase 13): a new shop's
// "Choose your password" (invite) and "Reset your password" (recovery). Verifying the
// token signs the user in; they then choose a password on /reset-password.
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const nextParam = searchParams.get("next");
  const next = nextParam?.startsWith("/") && !nextParam.startsWith("//") ? nextParam : "/reset-password";

  if (tokenHash && type && TYPES.includes(type)) {
    const supabase = await createClient();
    // Another account may be signed in on this browser: the link is for its own user.
    await supabase.auth.signOut({ scope: "local" });
    const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
    if (!error) return NextResponse.redirect(`${origin}${next}`);
  }

  return NextResponse.redirect(`${origin}/login?error=link_expired`);
}
