import type { NextRequest } from "next/server";
import { z } from "zod";
import { getCatalog } from "@/lib/admin-category-data";
import { buildCategoryIndex, fullPath } from "@/lib/categories";
import { toCsv } from "@/lib/csv";
import { createAdminClient } from "@/lib/supabase/admin";
import { getSuperadminSession } from "@/lib/superadmin";

/** /admin/categories CSV export: one industry's catalog in the import format (path, sku_prefix, icon, colour) plus usage. */
export async function GET(request: NextRequest) {
  const session = await getSuperadminSession();
  if (!session?.aal2) return new Response("Not found", { status: 404 });
  const industryId = request.nextUrl.searchParams.get("industry") ?? "";
  if (!z.uuid().safeParse(industryId).success) return new Response("Not found", { status: 404 });
  const { data: industry } = await createAdminClient().from("industries").select("slug").eq("id", industryId).maybeSingle();
  if (!industry) return new Response("Not found", { status: 404 });

  const { categories, items, orgs } = await getCatalog(industryId);
  const index = buildCategoryIndex(categories);
  const csv = toCsv(
    ["path", "sku_prefix", "icon", "colour", "archived", "items", "organizations"],
    index.flat.map((n) => [fullPath(n), n.sku_prefix ?? "", n.icon ?? "", n.color ?? "", n.is_archived ? "yes" : "", items[n.id] ?? 0, orgs[n.id] ?? 0]),
  );
  return new Response("﻿" + csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="categories-${industry.slug}.csv"`,
      "Cache-Control": "private, no-store",
    },
  });
}
