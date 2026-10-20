"use server";

import { getShopSession } from "@/lib/auth";
import { CHANGELOG } from "@/lib/changelog";
import { createClient } from "@/lib/supabase/server";

/** Clears the "What's new" dot for the signed-in user (their own profile, also while acting as a shop). */
export async function markWhatsNewSeen(id: string): Promise<{ status: "success" | "error" }> {
  if (!CHANGELOG.some((e) => e.id === id)) return { status: "error" };
  const { userId } = await getShopSession();
  const supabase = await createClient();
  const { error } = await supabase
    .from("profiles")
    .update({ whats_new_seen: id, updated_at: new Date().toISOString() })
    .eq("id", userId);
  if (error) {
    console.error("markWhatsNewSeen failed:", error);
    return { status: "error" };
  }
  return { status: "success" };
}
