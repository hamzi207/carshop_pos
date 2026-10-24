import "server-only";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import type { ModuleKey } from "@/lib/modules";

/**
 * The caller's organization's switched-on modules (Phase 18): the organization's switch, limited by its
 * subscription plan (public.my_modules(); follows Login As). Deduplicated per request.
 */
export const getMyModules = cache(async (): Promise<string[]> => {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("my_modules");
  if (error) {
    console.error("my_modules failed:", error.message);
    return [];
  }
  return data ?? [];
});

export const hasModule = async (key: ModuleKey) => (await getMyModules()).includes(key);
