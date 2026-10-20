import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { connection } from "next/server";
import type { Database } from "@/lib/types/database.types";
import { SUPABASE_PUBLIC_KEY, SUPABASE_URL } from "./env";
import { IMPERSONATION_HEADER, readImpersonationToken } from "./impersonation-header";

/**
 * Supabase client for Server Components, Server Actions and Route Handlers.
 * Create a new one per request — never share it in a module-level variable.
 *
 * connection() keeps every Supabase call at request time. With partialPrefetching,
 * cookies() alone can be read while prerendering the App Shell, and auth then calls
 * Date.now() for token expiry, which Next.js rejects during prerender. It also
 * guarantees auth checks are never served from a prerendered or cached result.
 *
 * While a superadmin is acting as a shop, the impersonation token rides along as a header;
 * the database checks it (private.current_tenant_id), so RLS then shows that shop.
 */
export async function createClient() {
  await connection();
  const cookieStore = await cookies();
  const impersonation = readImpersonationToken(cookieStore);

  return createServerClient<Database>(SUPABASE_URL, SUPABASE_PUBLIC_KEY, {
    global: impersonation ? { headers: { [IMPERSONATION_HEADER]: impersonation } } : undefined,
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options),
          );
        } catch {
          // Called from a Server Component, where cookies are read-only.
          // Safe to ignore: the proxy refreshes the session on every request.
        }
      },
    },
  });
}
