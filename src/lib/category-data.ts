import "server-only";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import type { Category } from "@/lib/categories";

/** The shop's categories (RLS: own shop only). Deduplicated per request. */
export const getCategories = cache(async (): Promise<Category[]> => {
  const supabase = await createClient();
  const { data, error } = await supabase.from("categories").select("id, name, parent_id, sort_order");
  if (error) {
    console.error("getCategories failed:", error.message);
    throw new Error("Could not load categories.");
  }
  return data;
});

/** Items per category id (directly on it, not counting subcategories). */
export const getCategoryCounts = cache(async (): Promise<Record<string, number>> => {
  const supabase = await createClient();
  const { data, error } = await supabase.from("inventory_items").select("category_id");
  if (error) {
    console.error("getCategoryCounts failed:", error.message);
    throw new Error("Could not load categories.");
  }
  const counts: Record<string, number> = {};
  for (const { category_id } of data) counts[category_id] = (counts[category_id] ?? 0) + 1;
  return counts;
});
