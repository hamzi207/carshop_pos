"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { buildCategoryIndex, descendantIds } from "@/lib/categories";
import { getCategories } from "@/lib/category-data";
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
  const { category, search, fitment, stock, sort } = inventoryFiltersSchema.parse(filters);
  const supabase = await createClient();

  // Search runs in SQL (search_inventory_items) because it has to match SKU,
  // name AND linked vehicles (make / model / year) together. It returns
  // inventory_items rows, so the fitment embed, filters and ordering still apply.
  let query = (
    search
      ? supabase.rpc("search_inventory_items", { p_query: search }).select(ITEM_WITH_FITMENT)
      : supabase.from("inventory_items").select(ITEM_WITH_FITMENT)
  ).order("name");

  if (category) {
    // The category and everything below it; an unknown id matches nothing.
    const node = buildCategoryIndex(await getCategories()).byId.get(category);
    query = query.in("category_id", node ? descendantIds(node) : [category]);
  }
  if (fitment) query = query.eq("is_universal", fitment === "universal");

  const { data, error } = await query;
  if (error) {
    console.error("getInventoryItems failed:", error.message);
    throw new Error("Could not load inventory.");
  }

  const items: InventoryListItem[] = data.map(({ item_vehicle_compatibility, ...item }) => ({
    ...item,
    vehicles: item_vehicle_compatibility
      .flatMap((link) => (link.vehicles ? [link.vehicles] : []))
      .sort((a, b) => b.year - a.year || a.make.localeCompare(b.make) || a.model.localeCompare(b.model)),
  }));

  // Stock compares columns (available = on hand − reserved vs the alert level), so it
  // filters here rather than in the query; the list is one shop's parts.
  const available = (i: InventoryListItem) => i.quantity_on_hand - i.reserved_quantity;
  const shown = stock
    ? items.filter((i) =>
        stock === "in" ? available(i) > 0 : stock === "out" ? available(i) <= 0 : available(i) <= i.low_stock_threshold,
      )
    : items;

  switch (sort) {
    case "newest":
      return shown.sort((a, b) => b.created_at.localeCompare(a.created_at));
    case "stock":
      return shown.sort((a, b) => available(a) - available(b) || a.name.localeCompare(b.name));
    case "price-high":
      return shown.sort((a, b) => Number(b.selling_price) - Number(a.selling_price));
    case "price-low":
      return shown.sort((a, b) => Number(a.selling_price) - Number(b.selling_price));
    default:
      return shown;
  }
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
    p_category_id: item.categoryId,
    p_cost_price: item.costPrice,
    p_selling_price: item.sellingPrice,
    p_quantity_on_hand: item.quantityOnHand,
    p_low_stock_threshold: item.lowStockThreshold,
    p_is_universal: item.isUniversal,
    p_price_includes_tax: item.priceIncludesTax,
    p_vendor_name: item.vendorName || undefined,
    p_vehicle_ids: item.isUniversal ? [] : item.vehicleIds,
  });

  if (error) {
    switch (error.code) {
      case "23505":
        return { status: "error", field: "sku", message: `SKU ${item.sku} is already used by another item.` };
      case "23514":
        if (error.message.includes("inventory_reserved_within_stock")) {
          return {
            status: "error",
            field: "quantityOnHand",
            message: "Stock on hand can't go below what open quotations have reserved. Cancel or invoice those quotations first.",
          };
        }
        console.error("saveInventoryItem failed:", error);
        return { status: "error", message: "We couldn't save this item. Please try again." };
      case "23503":
        if (error.message.includes("inventory_items_category_fkey")) {
          return { status: "error", field: "categoryId", message: "That category no longer exists. Choose another one." };
        }
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
