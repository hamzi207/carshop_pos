import { z } from "zod";

export const DISCOUNT_TYPES = ["amount", "percent"] as const;
export const DOCUMENT_STAGES = ["draft", "quotation", "invoice"] as const;

/** One line as the builder sends it. Parts carry their inventory id; labour lines don't. */
export const quoteLineSchema = z
  .object({
    itemId: z.uuid().nullable(),
    description: z.string().trim().min(1, "Every line needs a description.").max(300, "Keep descriptions under 300 characters."),
    isLabor: z.boolean(),
    quantity: z.number({ error: "Enter a quantity." }).positive("Quantities must be more than 0.").max(100_000, "That quantity is too large."),
    unitPrice: z.number({ error: "Enter a price." }).min(0, "Prices can't be negative.").max(100_000_000, "That price is too large."),
  })
  .refine((l) => l.isLabor || l.itemId !== null, "Parts must come from your inventory.");

export const quoteSchema = z
  .object({
    customerId: z.uuid({ error: "Choose a customer." }),
    vehicleId: z.number().int().positive().nullable(),
    customVehicleNotes: z.string().trim().max(200, "Keep vehicle notes under 200 characters."),
    discountType: z.enum(DISCOUNT_TYPES),
    discountValue: z.number({ error: "Enter a discount (0 for none)." }).min(0, "The discount can't be negative."),
    notes: z.string().trim().max(2000, "Keep notes under 2,000 characters."),
    lines: z.array(quoteLineSchema).max(200, "A document can have up to 200 lines."),
  })
  .refine((q) => q.discountType !== "percent" || q.discountValue <= 100, {
    message: "A percentage discount can't be more than 100%.",
    path: ["discountValue"],
  });

export type QuoteInput = z.infer<typeof quoteSchema>;
export type QuoteLineInput = z.infer<typeof quoteLineSchema>;

export const documentFiltersSchema = z.object({
  search: z.string().trim().max(100).optional().catch(undefined),
  status: z.string().max(20).optional().catch(undefined),
});

export type DocumentFilters = z.infer<typeof documentFiltersSchema>;
