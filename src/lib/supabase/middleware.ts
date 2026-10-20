import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { createHash } from "node:crypto";
import type { Database } from "@/lib/types/database.types";
import { createAdminClient } from "./admin";
import { SUPABASE_PUBLIC_KEY, SUPABASE_URL } from "./env";
import { IMPERSONATION_COOKIE, OLD_IMPERSONATION_COOKIE, readImpersonationToken } from "./impersonation-header";

const AUTH_PAGES = ["/login", "/register"];
// /share/<token>: the customer's view-only link to a quotation or invoice.
// /manifest.webmanifest: read by the browser before sign-in (Install app).
const PUBLIC_PATHS = ["/", "/auth", "/share/", "/manifest.webmanifest"];

function isPublic(pathname: string) {
  return PUBLIC_PATHS.some((p) => (p === "/" ? pathname === "/" : pathname.startsWith(p)));
}

/**
 * Refreshes the Supabase session cookie on every request and guards routes:
 * signed-out users are sent to /login, signed-in users skip /login and /register,
 * and /admin is for superadmins only (the pages check again with requireSuperadmin()).
 * While a superadmin is acting as a shop, every change they send (non-GET request) is
 * written to superadmin_audit_logs; an ended or expired "Login As" cookie is removed.
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

  if (!signedIn && !isPublic(pathname) && !AUTH_PAGES.includes(pathname)) {
    return redirectTo("/login");
  }
  if (signedIn && AUTH_PAGES.includes(pathname)) {
    return redirectTo("/dashboard");
  }

  const userId = data?.claims?.sub;
  if (userId && pathname.startsWith("/admin")) {
    const { data: me } = await createAdminClient().from("profiles").select("is_superadmin").eq("id", userId).maybeSingle();
    if (!me?.is_superadmin) return redirectTo("/dashboard");
  }

  const token = readImpersonationToken(request.cookies);
  if (token) {
    const admin = createAdminClient();
    const { data: session } = await admin
      .from("impersonation_sessions")
      .select("id, tenant_id")
      .eq("token_hash", createHash("sha256").update(token).digest("hex"))
      .eq("admin_id", userId ?? "")
      .is("ended_at", null)
      .gt("expires_at", new Date().toISOString())
      .maybeSingle();
    if (!session) {
      response.cookies.delete(IMPERSONATION_COOKIE);
      response.cookies.delete(OLD_IMPERSONATION_COOKIE);
    } else if (request.method !== "GET" && request.method !== "HEAD" && !pathname.startsWith("/admin")) {
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
