import { z } from "zod";

// PROJECT_SPEC.md §2.3: Pakistani shops price in Rs. or PKR only.
export const CURRENCIES = ["Rs.", "PKR"] as const;
export type Currency = (typeof CURRENCIES)[number];

export const shopSettingsSchema = z.object({
  currency: z.enum(CURRENCIES, { error: "Choose Rs. or PKR." }),
  showPaisa: z.boolean(),
  taxRate: z
    .number({ error: "Enter a tax rate (0 for none)." })
    .min(0, "Tax rate can't be negative.")
    .max(100, "Tax rate can't be above 100%."),
  pricesIncludeTax: z.boolean(),
  allowInternationalPhones: z.boolean(),
});

export type ShopSettingsInput = z.infer<typeof shopSettingsSchema>;
