import type { NextRequest } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import type { CustomerOptionsResponse } from "@/lib/types/quote";

/**
 * Customers for the quote builder's picker.
 *   GET /api/customers          → first 20 by name
 *   GET /api/customers?q=apex   → up to 20 matches (name, contact, phone, email, NTN)
 *   GET /api/customers?id=…     → that one customer (e.g. just registered from the builder)
 * Search uses search_customers. Runs with the caller's session, so RLS limits
 * it to their shop.
 */
const querySchema = z.object({ q: z.string().trim().max(100).optional(), id: z.uuid().optional() });

const COLUMNS = "id, name, customer_type, whatsapp_number";

export async function GET(request: NextRequest) {
  const parsed = querySchema.safeParse(Object.fromEntries(request.nextUrl.searchParams));
  if (!parsed.success) {
    return Response.json({ error: "Invalid search." }, { status: 400 });
  }
  const { q, id } = parsed.data;

  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  if (!claims?.claims) {
    return Response.json({ error: "Not signed in." }, { status: 401 });
  }

  let query = (
    q ? supabase.rpc("search_customers", { p_query: q }).select(COLUMNS) : supabase.from("customers").select(COLUMNS)
  )
    .order("name")
    .limit(20);
  if (id) query = query.eq("id", id);

  const { data, error } = await query;

  if (error) {
    console.error("Customer lookup failed:", error.message);
    return Response.json({ error: "Couldn't load customers." }, { status: 500 });
  }

  const body: CustomerOptionsResponse = { customers: data };
  return Response.json(body, { headers: { "Cache-Control": "no-store" } });
}
