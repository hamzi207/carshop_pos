import { z } from "zod";
import { isValidTimeZone } from "@/lib/timezones";

// PROJECT_SPEC.md §2.3: Pakistani shops price in Rs. or PKR only.
export const CURRENCIES = ["Rs.", "PKR"] as const;
export type Currency = (typeof CURRENCIES)[number];

// Dashboard clock design (tenants.clock_style).
export const CLOCK_STYLES = ["digital", "analog"] as const;
export type ClockStyle = (typeof CLOCK_STYLES)[number];

export const shopSettingsSchema = z.object({
  currency: z.enum(CURRENCIES, { error: "Choose Rs. or PKR." }),
  showPaisa: z.boolean(),
  taxRate: z
    .number({ error: "Enter a tax rate (0 for none)." })
    .min(0, "Tax rate can't be negative.")
    .max(100, "Tax rate can't be above 100%."),
  pricesIncludeTax: z.boolean(),
  allowInternationalPhones: z.boolean(),
  timezone: z.string().refine(isValidTimeZone, "Choose a timezone from the list."),
  showClock: z.boolean(),
  clockStyle: z.enum(CLOCK_STYLES, { error: "Choose digital or analog." }),
  clock24Hour: z.boolean(),
});

export type ShopSettingsInput = z.infer<typeof shopSettingsSchema>;
