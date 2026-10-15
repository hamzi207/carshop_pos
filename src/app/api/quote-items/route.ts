import type { NextRequest } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import type { PickerItemsResponse } from "@/lib/types/quote";

/**
 * Parts for the line-item search on drafts, quotations and invoices.
 *   GET /api/quote-items?q=tint   → up to 20 parts matching "tint" (SKU, name or linked vehicle)
 *   GET /api/quote-items          → the first 20 parts by name
 * Search uses search_inventory_items. Runs with the caller's session, so RLS
 * limits it to their shop.
 */
const querySchema = z.object({ q: z.string().trim().max(100).optional() });

const ITEM_COLUMNS =
  "id, sku, name, category, selling_price, quantity_on_hand, reserved_quantity, low_stock_threshold, price_includes_tax";

export async function GET(request: NextRequest) {
  const parsed = querySchema.safeParse(Object.fromEntries(request.nextUrl.searchParams));
  if (!parsed.success) {
    return Response.json({ error: "Invalid search." }, { status: 400 });
  }
  const { q } = parsed.data;

  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  if (!claims?.claims) {
    return Response.json({ error: "Not signed in." }, { status: 401 });
  }

  const { data, error } = await (
    q ? supabase.rpc("search_inventory_items", { p_query: q }).select(ITEM_COLUMNS) : supabase.from("inventory_items").select(ITEM_COLUMNS)
  )
    .order("name")
    .limit(20);
  if (error) {
    console.error("Quote item lookup failed:", error.message);
    return Response.json({ error: "Couldn't load parts." }, { status: 500 });
  }

  const body: PickerItemsResponse = {
    items: data.map((item) => ({ ...item, selling_price: Number(item.selling_price) })),
  };
  return Response.json(body, { headers: { "Cache-Control": "no-store" } });
}
