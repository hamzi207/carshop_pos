import type { NextRequest } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import type {
  VehicleMakesResponse,
  VehicleModelsResponse,
  VehicleYearsResponse,
} from "@/lib/types/vehicle";

/**
 * Cascading Year → Make → Model lookups for the vehicle dropdowns.
 *   GET /api/vehicles                        → { years }
 *   GET /api/vehicles?year=2023              → { year, makes }
 *   GET /api/vehicles?year=2023&make=TOYOTA  → { year, make, models: [{ id, model, trim }] }
 *
 * Vehicles are global reference data, but RLS only lets signed-in users read
 * them, so this runs with the caller's session. The catalog only changes when
 * the seed script runs, so browsers may cache each answer privately for an hour.
 */
const querySchema = z.object({
  year: z.coerce.number().int().min(1980).max(2035).optional(),
  make: z.string().trim().min(1).max(64).optional(),
});

// Empty answers are never cached, so a not-yet-seeded catalog does not stick.
const cacheHeaders = (rows: unknown[]) => ({
  "Cache-Control": rows.length > 0 ? "private, max-age=3600" : "no-store",
});

export async function GET(request: NextRequest) {
  const params = Object.fromEntries(request.nextUrl.searchParams);
  const parsed = querySchema.safeParse(params);
  if (!parsed.success) {
    return Response.json({ error: "Invalid year or make." }, { status: 400 });
  }
  const { year, make } = parsed.data;
  if (make && year === undefined) {
    return Response.json({ error: "make requires year." }, { status: 400 });
  }

  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  if (!claims?.claims) {
    return Response.json({ error: "Not signed in." }, { status: 401 });
  }

  if (year === undefined) {
    const { data, error } = await supabase.rpc("vehicle_years");
    if (error) return lookupFailed(error);
    const body: VehicleYearsResponse = { years: data.map((r) => r.year) };
    return Response.json(body, { headers: cacheHeaders(body.years) });
  }

  if (!make) {
    const { data, error } = await supabase.rpc("vehicle_makes", { p_year: year });
    if (error) return lookupFailed(error);
    const body: VehicleMakesResponse = { year, makes: data.map((r) => r.make) };
    return Response.json(body, { headers: cacheHeaders(body.makes) });
  }

  // Makes are stored upper-case (as NHTSA returns them).
  const makeName = make.toUpperCase();
  const { data, error } = await supabase.rpc("vehicle_models", { p_year: year, p_make: makeName });
  if (error) return lookupFailed(error);
  const body: VehicleModelsResponse = {
    year,
    make: makeName,
    // Generated types mark trim non-null, but seeded rows have no trim.
    models: data.map((r) => ({ id: r.id, model: r.model, trim: r.trim ?? null })),
  };
  return Response.json(body, { headers: cacheHeaders(body.models) });
}

function lookupFailed(error: { message: string }) {
  console.error("Vehicle lookup failed:", error.message);
  return Response.json({ error: "Vehicle lookup failed." }, { status: 500 });
}
