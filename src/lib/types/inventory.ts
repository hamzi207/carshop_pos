import type { Tables } from "./database.types";

/** A vehicle an item is linked to (via item_vehicle_compatibility). */
export type FitmentVehicle = {
  id: number;
  year: number;
  make: string;
  model: string;
  trim: string | null;
};

/** One inventory row with its compatible vehicles, as the inventory page shows it. */
export type InventoryListItem = Tables<"inventory_items"> & {
  vehicles: FitmentVehicle[];
};
