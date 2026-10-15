import type { Tables } from "./database.types";
import type { FitmentVehicle } from "./inventory";

/** A customer as the quote builder's picker shows it. */
export type CustomerOption = Pick<Tables<"customers">, "id" | "name" | "customer_type" | "whatsapp_number">;

/** One row on the Drafts / Quotations / Invoices lists. */
export type DocumentListItem = Pick<
  Tables<"quotes">,
  | "id"
  | "quote_number"
  | "draft_number"
  | "quotation_number"
  | "status"
  | "total_amount"
  | "created_at"
  | "updated_at"
  | "quoted_at"
  | "invoiced_at"
  | "custom_vehicle_notes"
> & {
  customer: Pick<Tables<"customers">, "id" | "name" | "customer_type"> | null;
  vehicle: Omit<FitmentVehicle, "id"> | null;
};

/** A saved line, plus what the builder needs to show it (SKU, stock). */
export type QuoteDocumentLine = Tables<"quote_items"> & {
  sku: string | null;
  quantityOnHand: number | null;
};

/** One document with its customer, vehicle and lines, for the builder. */
export type QuoteDocument = Tables<"quotes"> & {
  customer: CustomerOption | null;
  vehicle: FitmentVehicle | null;
  lines: QuoteDocumentLine[];
};

/**
 * An inventory part offered by the builder's picker. `fit` says how it relates
 * to the chosen vehicle: universal, linked to it, or neither.
 */
export type PickerItem = Pick<
  Tables<"inventory_items">,
  | "id"
  | "sku"
  | "name"
  | "category"
  | "selling_price"
  | "quantity_on_hand"
  | "low_stock_threshold"
  | "is_universal"
  | "price_includes_tax"
> & { fit: "universal" | "vehicle" | "other" };

/** GET /api/quote-items */
export type PickerItemsResponse = {
  items: PickerItem[];
  /** Parts that fit the chosen vehicle (linked + universal), when one is chosen. */
  fits: { linked: number; universal: number } | null;
};

/** GET /api/customers */
export type CustomerOptionsResponse = { customers: CustomerOption[] };
