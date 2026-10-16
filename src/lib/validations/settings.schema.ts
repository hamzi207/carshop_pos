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

// ---- Shop details printed on quotations and invoices (Settings → Your shop) ----

const optionalText = (max: number, label: string) =>
  z.string().trim().max(max, `${label} must be ${max} characters or fewer.`);

/** Shop NTN: 7 digits plus an optional check digit (1234567-8). Mirrors tenants_ntn_format_check. */
const shopNtn = z.string().transform((value, ctx) => {
  const d = value.replace(/[\s-]/g, "");
  if (!d) return "";
  if (/^\d{7}$/.test(d)) return d;
  if (/^\d{8}$/.test(d)) return `${d.slice(0, 7)}-${d.slice(7)}`;
  ctx.addIssue({ code: "custom", message: "An NTN has 7 digits plus a check digit, e.g. 1234567-8." });
  return z.NEVER;
});

/** Shop STRN: 13 digits. Mirrors tenants_strn_format_check. */
const shopStrn = z.string().transform((value, ctx) => {
  const d = value.replace(/[\s-]/g, "");
  if (!d) return "";
  if (/^\d{13}$/.test(d)) return d;
  ctx.addIssue({ code: "custom", message: "An STRN has 13 digits, e.g. 32-77-8761-234-56." });
  return z.NEVER;
});

/** Phone is checked server-side with the shop's international-numbers setting (see updateShopProfile). */
export const shopProfileSchema = z.object({
  name: z.string().trim().min(2, "Enter the shop name.").max(120, "Shop name must be 120 characters or fewer."),
  phone: optionalText(30, "Phone"),
  email: z.union([z.literal(""), z.email("Enter a valid email address.").max(200)]),
  address: optionalText(300, "Address"),
  ntn: shopNtn,
  strn: shopStrn,
  terms: optionalText(2000, "Terms"),
});
export type ShopProfileValues = z.input<typeof shopProfileSchema>;
