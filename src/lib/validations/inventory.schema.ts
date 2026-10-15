import { z } from "zod";

// Mirrors the inventory_items.category check constraint.
export const INVENTORY_CATEGORIES = [
  "Window Film",
  "Vinyl Wrap",
  "PPF",
  "Car Audio",
  "Accessories",
  "Hardware / Chemicals",
] as const;
export type InventoryCategory = (typeof INVENTORY_CATEGORIES)[number];

export const FITMENT_FILTERS = ["universal", "specific"] as const;
export type FitmentFilter = (typeof FITMENT_FILTERS)[number];

// numeric(10,2) tops out just under 100 million.
const MAX_PRICE = 99_999_999.99;

const price = (label: string) =>
  z
    .number({ error: `Enter a ${label}.` })
    .min(0, `${label[0].toUpperCase()}${label.slice(1)} can't be negative.`)
    .max(MAX_PRICE, "That price is too large.");

const wholeUnits = (label: string) =>
  z
    .number({ error: `Enter a ${label}.` })
    .int("Use whole units.")
    .min(0, "Can't be negative.")
    .max(1_000_000, "That number is too large.");

export const inventoryItemSchema = z
  .object({
    sku: z
      .string()
      .trim()
      .toUpperCase()
      .min(1, "Enter a SKU / part code.")
      .max(40, "SKU must be 40 characters or fewer.")
      .regex(/^[A-Z0-9][A-Z0-9._/-]*$/, "Use letters, numbers, dashes, dots or slashes only."),
    name: z
      .string()
      .trim()
      .min(2, "Enter a product name.")
      .max(120, "Name must be 120 characters or fewer."),
    description: z.string().trim().max(500, "Description must be 500 characters or fewer."),
    /** Who the shop buys it from (free text; no supplier records yet). */
    vendorName: z.string().trim().max(255, "Vendor name must be 255 characters or fewer."),
    category: z.enum(INVENTORY_CATEGORIES, { error: "Choose a category." }),
    costPrice: price("cost price"),
    sellingPrice: price("selling price"),
    quantityOnHand: wholeUnits("stock quantity"),
    lowStockThreshold: wholeUnits("low-stock alert level"),
    /** Selling price already includes the shop tax (default from shop settings). */
    priceIncludesTax: z.boolean(),
    isUniversal: z.boolean(),
    vehicleIds: z
      .array(z.number().int().positive())
      .max(500, "Link at most 500 vehicles to one item."),
  })
  .superRefine((item, ctx) => {
    if (!item.isUniversal && item.vehicleIds.length === 0) {
      ctx.addIssue({
        code: "custom",
        path: ["vehicleIds"],
        message: "Add at least one compatible vehicle, or switch to Universal Fit.",
      });
    }
  });

export type InventoryItemInput = z.infer<typeof inventoryItemSchema>;

// URL search params for /inventory. Invalid values are dropped, not errors.
export const inventoryFiltersSchema = z.object({
  category: z.enum(INVENTORY_CATEGORIES).optional().catch(undefined),
  search: z.string().trim().max(100).optional().catch(undefined),
  fitment: z.enum(FITMENT_FILTERS).optional().catch(undefined),
});

export type InventoryFilters = z.infer<typeof inventoryFiltersSchema>;
