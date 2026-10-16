// Pakistan-market vehicles (scripts/data/vehicles-pk.json) → public.vehicles catalog.
//   npm run seed:vehicles:pk             -> add every make/model/year in the file
//   npm run seed:vehicles:pk -- --dry-run -> count rows, write nothing
//
// NHTSA (seed-vehicles.mts) only knows US-market models; this adds the local ones
// (Mehran, Cultus, Alsvin, Haval H6, Prince Pearl…) and older years. Safe to re-run:
// a year/make/model that already exists (any capitalisation) is skipped.
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "../src/lib/types/database.types";

type Range = [number, number];
type Catalog = Record<string, Record<string, Range | Range[]> | string>;

const MIN_YEAR = 1960;
const MAX_YEAR = 2026;
const dryRun = process.argv.includes("--dry-run");

const catalog = JSON.parse(readFileSync(new URL("./data/vehicles-pk.json", import.meta.url), "utf8")) as Catalog;

const rows: { year: number; make: string; model: string }[] = [];
for (const [make, models] of Object.entries(catalog)) {
  if (make.startsWith("_") || typeof models === "string") continue;
  for (const [model, value] of Object.entries(models)) {
    const ranges: Range[] = typeof value[0] === "number" ? [value as Range] : (value as Range[]);
    for (const [from, to] of ranges) {
      for (let year = Math.max(from, MIN_YEAR); year <= Math.min(to, MAX_YEAR); year++) {
        rows.push({ year, make, model });
      }
    }
  }
}
const makes = [...new Set(rows.map((r) => r.make))];
console.log(`${rows.length} vehicle years across ${makes.length} makes in vehicles-pk.json.`);
if (dryRun) process.exit(0);

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) {
  console.error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in .env.local.");
  process.exit(1);
}
const supabase = createClient<Database>(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });

const key = (r: { year: number; make: string; model: string }) => `${r.year}|${r.make}|${r.model.toLowerCase()}`;

// Existing catalog rows for these makes (paged: PostgREST caps each response).
const existing = new Set<string>();
for (const make of makes) {
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase
      .from("vehicles")
      .select("year, make, model")
      .eq("make", make)
      .is("tenant_id", null)
      .order("id")
      .range(from, from + 999);
    if (error) throw new Error(`Reading ${make}: ${error.message}`);
    for (const r of data) existing.add(key(r));
    if (data.length < 1000) break;
  }
}

const missing = rows.filter((r) => !existing.has(key(r)));
for (let i = 0; i < missing.length; i += 500) {
  const { error } = await supabase
    .from("vehicles")
    .upsert(missing.slice(i, i + 500), { onConflict: "year,make,model,trim,tenant_id", ignoreDuplicates: true });
  if (error) throw new Error(`Insert: ${error.message}`);
}
console.log(`Added ${missing.length} (skipped ${rows.length - missing.length} already in the catalog).`);
