import { strToU8, zipSync, type Zippable } from "fflate";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { NextRequest } from "next/server";
import { toCsv, type CsvCell } from "@/lib/csv";
import { audit, getSuperadminSession } from "@/lib/superadmin";
import { createAdminClient } from "@/lib/supabase/admin";
import { billingToday } from "@/lib/subscription";
import type { Database } from "@/lib/types/database.types";

// Data tab → Full export (Phase 17, deliverable 6): a ZIP with a CSV and a JSON file for every table
// of the organization, its storage files, and a manifest. Superadmin notes, tags and follow-ups
// are left out (they're the platform's, not the organization's).

type Table = keyof Database["public"]["Tables"];

const TABLES: Table[] = [
  "profiles",
  "categories",
  "inventory_items",
  "item_vehicle_compatibility",
  "vehicles",
  "customers",
  "quotes",
  "quote_items",
  "invoice_payments",
  "invoice_payment_items",
  "email_logs",
  "tenant_subscriptions",
  "tenant_subscription_history",
  "subscription_invoices",
  "subscription_payments",
  "subscription_adjustments",
];
const BUCKETS = ["shop-assets", "subscription-proofs"];
const PAGE = 1000;
const MAX_ROWS = 200_000;

const cell = (v: unknown): CsvCell => (v === null || v === undefined ? null : typeof v === "number" || typeof v === "string" ? v : typeof v === "boolean" ? String(v) : JSON.stringify(v));

async function rowsOf(admin: ReturnType<typeof createAdminClient>, table: Table, tenantId: string) {
  // Every table here has tenant_id; the typed client can't express that across a union of tables.
  const db = admin as unknown as SupabaseClient;
  // Stable paging: by id (tenant_subscriptions has one row per tenant and no id).
  const key = table === "tenant_subscriptions" ? "tenant_id" : "id";
  const rows: Record<string, unknown>[] = [];
  for (let from = 0; from < MAX_ROWS; from += PAGE) {
    const { data, error } = await db.from(table).select("*").eq("tenant_id", tenantId).order(key).range(from, from + PAGE - 1);
    if (error) throw new Error(`${table}: ${error.message}`);
    rows.push(...(data as Record<string, unknown>[]));
    if (data.length < PAGE) break;
  }
  return rows;
}

/** Every file under `tenantId/` in the bucket (one level of folders deep is enough for both buckets). */
async function filesOf(admin: ReturnType<typeof createAdminClient>, bucket: string, tenantId: string, zip: Zippable) {
  let count = 0;
  const walk = async (prefix: string, depth: number): Promise<void> => {
    const { data } = await admin.storage.from(bucket).list(prefix, { limit: 1000 });
    for (const entry of data ?? []) {
      const path = `${prefix}/${entry.name}`;
      if (!entry.id) {
        if (depth < 3) await walk(path, depth + 1);
        continue;
      }
      const { data: blob } = await admin.storage.from(bucket).download(path);
      if (!blob) continue;
      zip[`files/${bucket}/${path}`] = new Uint8Array(await blob.arrayBuffer());
      count++;
    }
  };
  await walk(tenantId, 0);
  return count;
}

export async function GET(_request: NextRequest, ctx: RouteContext<"/api/admin/tenants/[id]/export">) {
  const session = await getSuperadminSession();
  if (!session?.aal2) return new Response("Not found", { status: 404 });
  const { id } = await ctx.params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return new Response("Not found", { status: 404 });
  const admin = createAdminClient();
  const { data: tenant } = await admin.from("tenants").select("*").eq("id", id).maybeSingle();
  if (!tenant) return new Response("Not found", { status: 404 });

  const zip: Zippable = {};
  const counts: Record<string, number> = { tenants: 1 };
  zip["tenants.json"] = strToU8(JSON.stringify([tenant], null, 2));
  zip["tenants.csv"] = strToU8(toCsv(Object.keys(tenant), [Object.values(tenant).map(cell)]));
  try {
    for (const table of TABLES) {
      const rows = await rowsOf(admin, table, id);
      counts[table] = rows.length;
      zip[`${table}.json`] = strToU8(JSON.stringify(rows, null, 2));
      const header = rows.length ? Object.keys(rows[0]!) : [];
      zip[`${table}.csv`] = strToU8(toCsv(header, rows.map((r) => header.map((k) => cell(r[k])))));
    }
    for (const bucket of BUCKETS) counts[`files:${bucket}`] = await filesOf(admin, bucket, id, zip);
  } catch (err) {
    console.error("tenant export failed:", err);
    return new Response("The export failed. Please try again.", { status: 500 });
  }
  zip["manifest.json"] = strToU8(
    JSON.stringify({ organization: { id, name: tenant.name, slug: tenant.slug }, exportedAt: new Date().toISOString(), exportedBy: session.email, rows: counts }, null, 2),
  );

  await audit({ adminId: session.userId, action: "tenant.export", tenantId: id, details: { rows: counts } });
  const body = zipSync(zip, { level: 6 });
  return new Response(body.buffer.slice(body.byteOffset, body.byteOffset + body.byteLength) as ArrayBuffer, {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${tenant.slug}-export-${billingToday()}.zip"`,
      "Cache-Control": "private, no-store",
    },
  });
}
