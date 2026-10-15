import { z } from "zod";
import { isValidTimeZone } from "@/lib/timezones";

// PROJECT_SPEC.md §2.3: Pakistani shops price in Rs. or PKR only.
export const CURRENCIES = ["Rs.", "PKR"] as const;
export type Currency = (typeof CURRENCIES)[number];

// Dashboard clock design (tenants.clock_style).
export const CLOCK_STYLES = ["digital", "analog"] as const;
export type ClockStyle = (typeof CLOCK_STYLES)[number];

// First day of the week (ISO day numbers, tenants.week_start): dashboard "This week" and the calendar.
export const WEEK_STARTS = [1, 7, 6] as const;
export type WeekStart = (typeof WEEK_STARTS)[number];
export const WEEK_START_LABEL: Record<WeekStart, string> = { 1: "Monday", 7: "Sunday", 6: "Saturday" };

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
  weekStart: z.union([z.literal(1), z.literal(6), z.literal(7)], { error: "Choose the first day of the week." }),
  quoteValidityDays: z
    .number({ error: "Enter a number of days." })
    .int("Use whole days.")
    .min(1, "Quotations must be valid for at least 1 day.")
    .max(365, "Use 365 days or fewer."),
});

export type ShopSettingsInput = z.infer<typeof shopSettingsSchema>;
