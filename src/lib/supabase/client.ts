import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "@/lib/types/database.types";
import { SUPABASE_PUBLIC_KEY, SUPABASE_URL } from "./env";

/** Supabase client for Client Components. */
export function createClient() {
  return createBrowserClient<Database>(SUPABASE_URL, SUPABASE_PUBLIC_KEY);
}
