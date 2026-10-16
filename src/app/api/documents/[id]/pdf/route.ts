import type { NextRequest } from "next/server";
import { pdfResponse } from "@/lib/pdf";
import { loadPrintable } from "@/lib/printable";
import { createClient } from "@/lib/supabase/server";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Signed-in PDF of one of the shop's documents (RLS limits it to the user's own shop). ?download=1 saves it. */
export async function GET(request: NextRequest, ctx: RouteContext<"/api/documents/[id]/pdf">) {
  const { id } = await ctx.params;
  if (!UUID.test(id)) return new Response("Not found", { status: 404 });
  const doc = await loadPrintable(await createClient(), { id });
  if (!doc) return new Response("Not found", { status: 404 });
  return pdfResponse(doc, request.nextUrl.searchParams.has("download"));
}
