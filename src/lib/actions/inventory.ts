"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import type { InventoryListItem } from "@/lib/types/inventory";
import {
  inventoryFiltersSchema,
  inventoryItemSchema,
  type InventoryFilters,
  type InventoryItemInput,
} from "@/lib/validations/inventory.schema";

// Every query below runs with the caller's session, so RLS limits it to their
// own shop. tenant_id is never taken from the client.

export type InventoryActionResult =
  | { status: "success"; id: string }
  | { status: "error"; message: string; field?: keyof InventoryItemInput };

const itemIdSchema = z.uuid();

const ITEM_WITH_FITMENT = "*, item_vehicle_compatibility(vehicles(id, year, make, model, trim))";

export async function getInventoryItems(filters: InventoryFilters = {}): Promise<InventoryListItem[]> {
  const { category, search, fitment } = inventoryFiltersSchema.parse(filters);
  const supabase = await createClient();

  // Search runs in SQL (search_inventory_items) because it has to match SKU,
  // name AND linked vehicles (make / model / year) together. It returns
  // inventory_items rows, so the fitment embed, filters and ordering still apply.
  let query = (
    search
      ? supabase.rpc("search_inventory_items", { p_query: search }).select(ITEM_WITH_FITMENT)
      : supabase.from("inventory_items").select(ITEM_WITH_FITMENT)
  ).order("name");

  if (category) query = query.eq("category", category);
  if (fitment) query = query.eq("is_universal", fitment === "universal");

  const { data, error } = await query;
  if (error) {
    console.error("getInventoryItems failed:", error.message);
    throw new Error("Could not load inventory.");
  }

  return data.map(({ item_vehicle_compatibility, ...item }) => ({
    ...item,
    vehicles: item_vehicle_compatibility
      .flatMap((link) => (link.vehicles ? [link.vehicles] : []))
      .sort((a, b) => b.year - a.year || a.make.localeCompare(b.make) || a.model.localeCompare(b.model)),
  }));
}

/** Creates (no id) or updates an item and its vehicle fitment in one transaction. */
async function saveInventoryItem(id: string | undefined, input: InventoryItemInput): Promise<InventoryActionResult> {
  const parsed = inventoryItemSchema.safeParse(input);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return {
      status: "error",
      message: issue?.message ?? "Check the highlighted fields.",
      field: issue?.path[0] as keyof InventoryItemInput | undefined,
    };
  }
  const item = parsed.data;

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("save_inventory_item", {
    p_item_id: id,
    p_sku: item.sku,
    p_name: item.name,
    p_description: item.description || undefined,
    p_category: item.category,
    p_cost_price: item.costPrice,
    p_selling_price: item.sellingPrice,
    p_quantity_on_hand: item.quantityOnHand,
    p_low_stock_threshold: item.lowStockThreshold,
    p_is_universal: item.isUniversal,
    p_vehicle_ids: item.isUniversal ? [] : item.vehicleIds,
  });

  if (error) {
    switch (error.code) {
      case "23505":
        return { status: "error", field: "sku", message: `SKU ${item.sku} is already used by another item.` };
      case "23503":
        return { status: "error", field: "vehicleIds", message: "One of the selected vehicles no longer exists. Remove it and try again." };
      case "22023":
        return { status: "error", field: "vehicleIds", message: error.message };
      case "P0002":
        return { status: "error", message: "This item no longer exists. It may have been deleted." };
      case "42501":
        return { status: "error", message: "Your session has expired. Please sign in again." };
      default:
        console.error("saveInventoryItem failed:", error);
        return { status: "error", message: "We couldn't save this item. Please try again." };
    }
  }

  refresh();
  return { status: "success", id: data };
}

export async function createInventoryItem(input: InventoryItemInput) {
  return saveInventoryItem(undefined, input);
}

export async function updateInventoryItem(id: string, input: InventoryItemInput) {
  if (!itemIdSchema.safeParse(id).success) {
    return { status: "error", message: "Invalid item." } satisfies InventoryActionResult;
  }
  return saveInventoryItem(id, input);
}

/**
 * Deletes an item; its vehicle links cascade. Quote lines that used it keep
 * their description and prices (quote_items.item_id is set to null).
 */
export async function deleteInventoryItem(id: string): Promise<InventoryActionResult> {
  if (!itemIdSchema.safeParse(id).success) {
    return { status: "error", message: "Invalid item." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.from("inventory_items").delete().eq("id", id).select("id");

  if (error) {
    console.error("deleteInventoryItem failed:", error);
    return { status: "error", message: "We couldn't delete this item. Please try again." };
  }
  if (data.length === 0) {
    return { status: "error", message: "This item no longer exists. It may have been deleted." };
  }

  refresh();
  return { status: "success", id };
}
