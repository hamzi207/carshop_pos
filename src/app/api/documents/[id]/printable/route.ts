import type { NextRequest } from "next/server";
import { customerLink } from "@/lib/customer-link";
import { loadPrintable } from "@/lib/printable";
import { createClient } from "@/lib/supabase/server";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Signed-in print data for one of the shop's documents (RLS limits it to the user's own shop), for the POS slip printed from the screen. */
export async function GET(request: NextRequest, ctx: RouteContext<"/api/documents/[id]/printable">) {
  const { id } = await ctx.params;
  if (!UUID.test(id)) return Response.json({ error: "Not found" }, { status: 404 });
  const doc = await loadPrintable(await createClient(), { id });
  if (!doc) return Response.json({ error: "Not found" }, { status: 404 });
  return Response.json({ doc, shareUrl: customerLink(doc, request.nextUrl.origin) }, { headers: { "Cache-Control": "private, no-store" } });
}
