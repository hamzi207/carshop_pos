import type { Tables, TablesInsert } from "./database.types";

// ---------------------------------------------------------------------------
// NHTSA vPIC API (https://vpic.nhtsa.dot.gov/api/) — response shapes
// ---------------------------------------------------------------------------

/** Every vPIC endpoint wraps its rows in this envelope. */
export type NhtsaResponse<T> = {
  Count: number;
  Message: string;
  SearchCriteria: string | null;
  Results: T[];
};

/** GET /vehicles/GetMakesForVehicleType/{type} */
export type NhtsaMakeResult = {
  MakeId: number;
  MakeName: string;
  VehicleTypeId: number;
  VehicleTypeName: string;
};

/** GET /vehicles/GetModelsForMakeYear/make/{make}/modelyear/{year}[/vehicletype/{type}] */
export type NhtsaModelResult = {
  Make_ID: number;
  Make_Name: string;
  Model_ID: number;
  Model_Name: string;
  /** Only present when the request filters by vehicle type. */
  VehicleTypeId?: number;
  VehicleTypeName?: string;
};

/**
 * vPIC vehicle-type filters we seed. "mpv" (Multipurpose Passenger Vehicle) is
 * where NHTSA files SUVs and minivans; leaving the filter off pulls in
 * motorcycles, trailers and buses.
 */
export const NHTSA_VEHICLE_TYPES = ["car", "truck", "mpv"] as const;
export type NhtsaVehicleType = (typeof NHTSA_VEHICLE_TYPES)[number];

// ---------------------------------------------------------------------------
// Database rows (public.vehicles: global reference data, not tenant-scoped)
// ---------------------------------------------------------------------------

export type Vehicle = Tables<"vehicles">;
export type VehicleInsert = TablesInsert<"vehicles">;

// ---------------------------------------------------------------------------
// GET /api/vehicles: cascading Year → Make → Model lookups
// ---------------------------------------------------------------------------

/** One selectable model for a year + make. `id` is what quotes and fitment store. */
export type VehicleModelOption = {
  id: number;
  model: string;
  trim: string | null;
};

export type VehicleYearsResponse = { years: number[] };
export type VehicleMakesResponse = { year: number; makes: string[] };
export type VehicleModelsResponse = { year: number; make: string; models: VehicleModelOption[] };
