import type { NextRequest } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import type { PickerItemsResponse } from "@/lib/types/quote";

/**
 * Parts for the quote builder's picker (the "Magic Fit" filter, spec §2.2 D).
 *   GET /api/quote-items?q=tint                    → any part matching "tint"
 *   GET /api/quote-items?vehicle=123               → universal parts + parts linked to vehicle 123
 *   GET /api/quote-items?vehicle=123&all=1         → every part, each marked universal / fits / other
 * Search uses search_inventory_items (SKU, name and linked vehicles). Runs
 * with the caller's session, so RLS limits it to their shop.
 */
const querySchema = z.object({
  q: z.string().trim().max(100).optional(),
  vehicle: z.coerce.number().int().positive().optional(),
  all: z.enum(["1"]).optional(),
});

const ITEM_COLUMNS =
  "id, sku, name, category, selling_price, quantity_on_hand, low_stock_threshold, is_universal, price_includes_tax";
const LIMIT = 50;

export async function GET(request: NextRequest) {
  const parsed = querySchema.safeParse(Object.fromEntries(request.nextUrl.searchParams));
  if (!parsed.success) {
    return Response.json({ error: "Invalid search." }, { status: 400 });
  }
  const { q, vehicle, all } = parsed.data;

  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  if (!claims?.claims) {
    return Response.json({ error: "Not signed in." }, { status: 401 });
  }

  // Parts linked to the chosen vehicle.
  let linked = new Set<string>();
  let universalCount = 0;
  if (vehicle) {
    const [links, universal] = await Promise.all([
      supabase.from("item_vehicle_compatibility").select("item_id").eq("vehicle_id", vehicle),
      supabase.from("inventory_items").select("id", { count: "exact", head: true }).eq("is_universal", true),
    ]);
    if (links.error || universal.error) return lookupFailed(links.error ?? universal.error);
    linked = new Set(links.data.map((l) => l.item_id));
    universalCount = universal.count ?? 0;
  }

  let query = (
    q ? supabase.rpc("search_inventory_items", { p_query: q }).select(ITEM_COLUMNS) : supabase.from("inventory_items").select(ITEM_COLUMNS)
  )
    .order("name")
    .limit(LIMIT);

  if (vehicle && !all) {
    // Visible = universal ∪ linked to the vehicle.
    query = linked.size > 0 ? query.or(`is_universal.eq.true,id.in.(${[...linked].join(",")})`) : query.eq("is_universal", true);
  }

  const { data, error } = await query;
  if (error) return lookupFailed(error);

  const body: PickerItemsResponse = {
    items: data.map((item) => ({
      ...item,
      selling_price: Number(item.selling_price),
      fit: item.is_universal ? "universal" : linked.has(item.id) ? "vehicle" : "other",
    })),
    fits: vehicle ? { linked: linked.size, universal: universalCount } : null,
  };
  return Response.json(body, { headers: { "Cache-Control": "no-store" } });
}

function lookupFailed(error: { message: string } | null) {
  console.error("Quote item lookup failed:", error?.message);
  return Response.json({ error: "Couldn't load parts." }, { status: 500 });
}
