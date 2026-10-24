import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { createHash } from "node:crypto";
import type { Database } from "@/lib/types/database.types";
import { createAdminClient } from "./admin";
import { SUPABASE_PUBLIC_KEY, SUPABASE_URL } from "./env";
import { IMPERSONATION_COOKIE, OLD_IMPERSONATION_COOKIE, readImpersonationToken } from "./impersonation-header";

// Mirrors PLATFORM_ADMIN_CLAIM in src/lib/superadmin.ts (server-only, so not imported here).
const PLATFORM_ADMIN_CLAIM = "platform_admin";
const ADMIN_LOGIN = "/admin/login";
const ADMIN_MFA = "/admin/mfa";

const AUTH_PAGES = ["/login"];
// /share/<token>: the customer's view-only link to a quotation or invoice.
// /manifest.webmanifest: read by the browser before sign-in (Install app).
// /api/cron/: scheduled jobs, which check CRON_SECRET themselves.
const PUBLIC_PATHS = ["/", "/auth", "/share/", "/manifest.webmanifest", "/api/cron/"];

function isPublic(pathname: string) {
  return PUBLIC_PATHS.some((p) => (p === "/" ? pathname === "/" : pathname.startsWith(p)));
}

/**
 * Refreshes the Supabase session cookie on every request and guards routes:
 * signed-out users are sent to /login, signed-in users skip /login,
 * and /admin is for superadmin accounts only, signed in at /admin/login, after two-factor sign-in
 * (aal2, else /admin/mfa; the pages check again with requireSuperadmin()). Superadmins have no shop.
 * While a superadmin is acting as a shop, every change they send (non-GET request) is
 * written to superadmin_audit_logs; in a read-only "Login As" (Phase 17) it is refused instead
 * (the database also makes those requests read only). An ended or expired cookie is removed.
 */
export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient<Database>(SUPABASE_URL, SUPABASE_PUBLIC_KEY, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet, headers) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options),
        );
        Object.entries(headers ?? {}).forEach(([key, value]) => response.headers.set(key, value));
      },
    },
  });

  // Do not run code between createServerClient and getClaims(): it refreshes the session.
  const { data } = await supabase.auth.getClaims();
  const signedIn = Boolean(data?.claims);
  const { pathname } = request.nextUrl;

  const redirectTo = (path: string) => {
    const url = request.nextUrl.clone();
    url.pathname = path;
    url.search = path === "/login" && pathname !== "/" ? `?next=${encodeURIComponent(pathname)}` : "";
    const redirect = NextResponse.redirect(url);
    response.cookies.getAll().forEach((cookie) => redirect.cookies.set(cookie));
    return redirect;
  };

  // The superadmin console is separate from the shops: its own sign-in (/admin/login), its own
  // accounts (platform_admins, flagged in app_metadata for routing; the pages check the table).
  const consolePath = pathname === "/admin" || pathname.startsWith("/admin/") || pathname.startsWith("/api/admin/");
  const platformAdmin = (data?.claims?.app_metadata as Record<string, unknown> | undefined)?.[PLATFORM_ADMIN_CLAIM] === true;
  const withNext = (path: string) => {
    const url = request.nextUrl.clone();
    url.pathname = path;
    url.search = `?next=${encodeURIComponent(pathname + request.nextUrl.search)}`;
    const redirect = NextResponse.redirect(url);
    response.cookies.getAll().forEach((cookie) => redirect.cookies.set(cookie));
    return redirect;
  };

  if (consolePath) {
    if (pathname === ADMIN_LOGIN) {
      // A shop user may see the form (to sign in with their separate superadmin account).
      if (signedIn && platformAdmin) return redirectTo("/admin");
    } else if (!signedIn || !platformAdmin) {
      // Signed out, or signed in to a shop: the console's own sign-in.
      return pathname.startsWith("/api/") ? NextResponse.json({ error: "Not found" }, { status: 404 }) : withNext(ADMIN_LOGIN);
    } else if (pathname !== ADMIN_MFA && data?.claims?.aal !== "aal2") {
      return withNext(ADMIN_MFA);
    }
  } else {
    if (!signedIn && !isPublic(pathname) && !AUTH_PAGES.includes(pathname)) {
      return redirectTo("/login");
    }
    if (signedIn && AUTH_PAGES.includes(pathname)) {
      return redirectTo(platformAdmin ? "/admin" : "/dashboard");
    }
    // A superadmin has no shop: shop pages only open while they're acting as one (Login As).
    // /reset-password is shared: invited superadmins choose their password there.
    if (signedIn && platformAdmin && !isPublic(pathname) && pathname !== "/reset-password" && !pathname.startsWith("/api/") && !readImpersonationToken(request.cookies)) {
      return redirectTo("/admin");
    }
  }

  const userId = data?.claims?.sub;

  const token = readImpersonationToken(request.cookies);
  if (token) {
    const admin = createAdminClient();
    const { data: session } = await admin
      .from("impersonation_sessions")
      .select("id, tenant_id, mode")
      .eq("token_hash", createHash("sha256").update(token).digest("hex"))
      .eq("admin_id", userId ?? "")
      .is("ended_at", null)
      .gt("expires_at", new Date().toISOString())
      .maybeSingle();
    if (!session) {
      response.cookies.delete(IMPERSONATION_COOKIE);
      response.cookies.delete(OLD_IMPERSONATION_COOKIE);
    } else if (request.method !== "GET" && request.method !== "HEAD" && !pathname.startsWith("/admin") && !pathname.startsWith("/auth")) {
      if (session.mode === "read_only") {
        return NextResponse.json(
          { error: "This is a read-only session: nothing can be changed. Exit and use Login As with full access to make changes." },
          { status: 403 },
        );
      }
      const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
      const { error } = await admin.from("superadmin_audit_logs").insert({
        admin_id: userId,
        target_tenant_id: session.tenant_id,
        action: "impersonation.request",
        details: {
          method: request.method,
          path: pathname,
          // Server Actions post to the page they run on and name the action in this header.
          serverAction: request.headers.get("next-action"),
          sessionId: session.id,
        },
        ip_address: ip && /^[0-9a-f.:]{3,45}$/i.test(ip) ? ip : null,
      });
      if (error) console.error("impersonation audit failed:", error);
    }
  }

  return response;
}
