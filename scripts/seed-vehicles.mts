// NHTSA vPIC → public.vehicles seed (PROJECT_SPEC.md §4.3).
//   npm run seed:vehicles              -> seed every TARGET_YEARS × TARGET_MAKES
//   npm run seed:vehicles -- --dry-run -> fetch + print one year/make, write nothing
//
// Runs on Node's built-in TypeScript support, so only `import type` may reach
// into src/ (type imports are erased; runtime imports would need a bundler).
// Safe to re-run: existing (year, make, model) rows are skipped.
import { createClient } from "@supabase/supabase-js";
import type { Database } from "../src/lib/types/database.types";
import type {
  NhtsaModelResult,
  NhtsaResponse,
  NhtsaVehicleType,
  VehicleInsert,
} from "../src/lib/types/vehicle";

const TARGET_YEARS = Array.from({ length: 2026 - 2015 + 1 }, (_, i) => 2026 - i);
const TARGET_MAKES = [
  "Toyota", "Ford", "Chevrolet", "Honda", "Nissan", "Jeep", "Ram",
  "Subaru", "GMC", "BMW", "Mercedes-Benz", "Audi", "Tesla", "Porsche",
  "Lexus", "Hyundai", "Kia", "Dodge", "Cadillac", "Volkswagen",
];
// Keep in sync with NHTSA_VEHICLE_TYPES in src/lib/types/vehicle.ts.
const VEHICLE_TYPES: readonly NhtsaVehicleType[] = ["car", "truck", "mpv"];

const DELAY_MS = 300; // polite pause between make/year batches
const MAX_ATTEMPTS = 3;

const dryRun = process.argv.includes("--dry-run");

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!dryRun && (!url || !serviceKey)) {
  console.error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in .env.local.");
  process.exit(1);
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function fetchJson<T>(endpoint: string): Promise<NhtsaResponse<T>> {
  for (let attempt = 1; ; attempt++) {
    try {
      const res = await fetch(endpoint, { signal: AbortSignal.timeout(20_000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return (await res.json()) as NhtsaResponse<T>;
    } catch (err) {
      if (attempt >= MAX_ATTEMPTS) throw err;
      await sleep(1000 * attempt);
    }
  }
}

/**
 * All car/truck/SUV models for one make and year.
 * vPIC matches `make` as a substring ("Ram" also returns RAMBLER, trailer
 * builders, …), so only rows whose Make_Name is exactly the make are kept.
 */
async function fetchModels(make: string, year: number): Promise<VehicleInsert[]> {
  const makeName = make.toUpperCase();
  const responses = await Promise.all(
    VEHICLE_TYPES.map((type) =>
      fetchJson<NhtsaModelResult>(
        `https://vpic.nhtsa.dot.gov/api/vehicles/GetModelsForMakeYear/make/${encodeURIComponent(make)}` +
          `/modelyear/${year}/vehicletype/${type}?format=json`,
      ),
    ),
  );

  const models = new Set<string>();
  for (const { Results } of responses) {
    for (const r of Results ?? []) {
      if (r.Make_Name.trim().toUpperCase() !== makeName) continue;
      const model = r.Model_Name.replace(/\s+/g, " ").trim();
      if (model) models.add(model);
    }
  }
  return [...models].map((model) => ({ year, make: makeName, model }));
}

async function main() {
  if (dryRun) {
    const rows = await fetchModels("Ram", 2023);
    console.log(`Dry run: 2023 Ram → ${rows.length} models`);
    console.table(rows);
    return;
  }

  const supabase = createClient<Database>(url!, serviceKey!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  console.log(
    `Seeding ${TARGET_MAKES.length} makes × ${TARGET_YEARS.length} years ` +
      `(${TARGET_YEARS.at(-1)}–${TARGET_YEARS[0]}) from NHTSA vPIC…`,
  );

  let fetched = 0;
  const failures: string[] = [];

  for (const year of TARGET_YEARS) {
    for (const make of TARGET_MAKES) {
      const label = `${year} ${make}`;
      try {
        const rows = await fetchModels(make, year);
        if (rows.length > 0) {
          const { error } = await supabase
            .from("vehicles")
            .upsert(rows, { onConflict: "year,make,model,trim", ignoreDuplicates: true });
          if (error) throw new Error(`DB: ${error.message}`);
        }
        fetched += rows.length;
        console.log(`  ✓ ${label.padEnd(22)} ${rows.length} models`);
      } catch (err) {
        failures.push(label);
        console.error(`  ✗ ${label.padEnd(22)} ${err instanceof Error ? err.message : err}`);
      }
      await sleep(DELAY_MS);
    }
  }

  const { count } = await supabase.from("vehicles").select("*", { count: "exact", head: true });
  console.log(`\nDone. ${fetched} models fetched; vehicles table now holds ${count ?? "?"} rows.`);

  if (failures.length > 0) {
    console.error(`${failures.length} batch(es) failed: ${failures.join(", ")}. Re-run to retry them.`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
