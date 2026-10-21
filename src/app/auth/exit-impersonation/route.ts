import { NextResponse, type NextRequest } from "next/server";
import { closeImpersonation } from "@/lib/impersonation";

// The "Login As" banner's Exit (Phase 17). A route under /auth, not a server action, so it still
// works in a read-only session, where the proxy refuses every other change outside /admin.
export async function POST(request: NextRequest) {
  // Only from our own pages (the cookies are SameSite=Lax, this is a second check).
  const origin = request.headers.get("origin");
  if (origin && origin !== request.nextUrl.origin) return new NextResponse("Forbidden", { status: 403 });
  await closeImpersonation();
  return NextResponse.redirect(`${request.nextUrl.origin}/admin/tenants`, 303);
}
