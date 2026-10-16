import type { NextRequest } from "next/server";
import { pdfResponse } from "@/lib/pdf";
import { loadPrintable } from "@/lib/printable";
import { createAdminClient } from "@/lib/supabase/admin";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Public PDF behind a document's unguessable share link (no sign-in). Drafts are never shared. */
export async function GET(request: NextRequest, ctx: RouteContext<"/share/[token]/pdf">) {
  const { token } = await ctx.params;
  if (!UUID.test(token)) return new Response("Not found", { status: 404 });
  const doc = await loadPrintable(createAdminClient(), { token });
  if (!doc || doc.section === "drafts") return new Response("Not found", { status: 404 });
  return pdfResponse(doc, request.nextUrl.searchParams.has("download"));
}
