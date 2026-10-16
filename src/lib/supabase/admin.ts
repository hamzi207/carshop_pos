import "server-only";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/types/database.types";
import { SUPABASE_URL } from "./env";

/**
 * Service-role client: bypasses RLS. Server-only, and used for exactly one thing:
 * reading a single document by its unguessable share token for the public /share page.
 * Never pass user-chosen filters to it.
 */
export function createAdminClient() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error("SUPABASE_SERVICE_ROLE_KEY is not set.");
  return createSupabaseClient<Database>(SUPABASE_URL, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
