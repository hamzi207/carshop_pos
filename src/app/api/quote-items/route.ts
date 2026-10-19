import type { NextRequest } from "next/server";
import { z } from "zod";
import { buildCategoryIndex, descendantIds } from "@/lib/categories";
import { getCategories } from "@/lib/category-data";
import { createClient } from "@/lib/supabase/server";
import type { PickerItemsResponse } from "@/lib/types/quote";

/**
 * Parts for the line-item search on drafts, quotations and invoices.
 *   GET /api/quote-items?q=tint   → up to 20 parts matching "tint" (SKU, name or linked vehicle)
 *   GET /api/quote-items          → the first 20 parts by name
 *   GET /api/quote-items?category=<id> → only that category and everything below it (phone chips)
 * Search uses search_inventory_items. Runs with the caller's session, so RLS
 * limits it to their shop.
 */
const querySchema = z.object({ q: z.string().trim().max(100).optional(), category: z.uuid().optional() });

const ITEM_COLUMNS =
  "id, sku, name, category:categories(name), selling_price, quantity_on_hand, reserved_quantity, low_stock_threshold, price_includes_tax";

export async function GET(request: NextRequest) {
  const parsed = querySchema.safeParse(Object.fromEntries(request.nextUrl.searchParams));
  if (!parsed.success) {
    return Response.json({ error: "Invalid search." }, { status: 400 });
  }
  const { q, category } = parsed.data;

  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  if (!claims?.claims) {
    return Response.json({ error: "Not signed in." }, { status: 401 });
  }

  let query = q ? supabase.rpc("search_inventory_items", { p_query: q }).select(ITEM_COLUMNS) : supabase.from("inventory_items").select(ITEM_COLUMNS);
  if (category) {
    // An unknown id matches nothing.
    const node = buildCategoryIndex(await getCategories()).byId.get(category);
    query = query.in("category_id", node ? descendantIds(node) : [category]);
  }
  const { data, error } = await query.order("name").limit(20);
  if (error) {
    console.error("Quote item lookup failed:", error.message);
    return Response.json({ error: "Couldn't load parts." }, { status: 500 });
  }

  const body: PickerItemsResponse = {
    items: data.map((item) => ({ ...item, selling_price: Number(item.selling_price) })),
  };
  return Response.json(body, { headers: { "Cache-Control": "no-store" } });
}
