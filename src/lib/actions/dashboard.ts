"use server";

import { refresh } from "next/cache";
import { getShopSession } from "@/lib/auth";
import { dashboardPrefsSchema, type DashboardMetrics, type DashboardPrefs, type DashboardRange } from "@/lib/dashboard";
import { createClient } from "@/lib/supabase/server";

/** Sales, profit and pipeline figures for one date range, in the shop's timezone (RPC dashboard_metrics). */
export async function getDashboardMetrics({ range, from, to }: DashboardRange): Promise<DashboardMetrics> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("dashboard_metrics", {
    p_range: range,
    ...(from ? { p_from: from } : {}),
    ...(to ? { p_to: to } : {}),
  });
  if (error) {
    console.error("getDashboardMetrics failed:", error.message);
    throw new Error("Could not load dashboard figures.");
  }
  return data as unknown as DashboardMetrics;
}

/** Saves the signed-in user's widget choices (profiles.dashboard_prefs). */
export async function saveDashboardPrefs(
  prefs: DashboardPrefs,
): Promise<{ status: "success" } | { status: "error"; message: string }> {
  const parsed = dashboardPrefsSchema.safeParse(prefs);
  if (!parsed.success) {
    return { status: "error", message: parsed.error.issues[0]?.message ?? "Check your choices." };
  }

  const { userId } = await getShopSession();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("profiles")
    .update({ dashboard_prefs: parsed.data, updated_at: new Date().toISOString() })
    .eq("id", userId)
    .select("id");
  if (error || data.length === 0) {
    if (error) console.error("saveDashboardPrefs failed:", error);
    return { status: "error", message: "We couldn't save your dashboard layout. Please try again." };
  }

  refresh();
  return { status: "success" };
}
