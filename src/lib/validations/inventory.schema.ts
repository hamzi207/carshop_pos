import { z } from "zod";

export const FITMENT_FILTERS = ["universal", "specific"] as const;
export type FitmentFilter = (typeof FITMENT_FILTERS)[number];

/** in = some available · low = at or below the alert level (incl. none) · out = none available. */
export const STOCK_FILTERS = ["in", "low", "out"] as const;
export type StockFilter = (typeof STOCK_FILTERS)[number];

export const INVENTORY_SORTS = ["name", "newest", "stock", "price-high", "price-low"] as const;
export type InventorySort = (typeof INVENTORY_SORTS)[number];

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
    categoryId: z.uuid({ error: "Choose a category." }),
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
  /** A category id; includes everything below it. */
  category: z.uuid().optional().catch(undefined),
  search: z.string().trim().max(100).optional().catch(undefined),
  fitment: z.enum(FITMENT_FILTERS).optional().catch(undefined),
  stock: z.enum(STOCK_FILTERS).optional().catch(undefined),
  sort: z.enum(INVENTORY_SORTS).optional().catch(undefined),
});

export type InventoryFilters = z.infer<typeof inventoryFiltersSchema>;
