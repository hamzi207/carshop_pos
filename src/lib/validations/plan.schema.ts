import { z } from "zod";
import { MODULE_KEYS } from "@/lib/modules";

// /admin/plans (Phase 17, deliverable 9): plans are data the superadmin edits, never code.

const money = z.number().min(0, "Prices can't be negative.").max(10_000_000, "That price is too high.").nullable();
const limit = (label: string) =>
  z.number().int(`${label} must be a whole number.`).min(1, `${label} must be at least 1, or empty for unlimited.`).max(1_000_000).nullable();

export const planSchema = z
  .object({
    name: z.string().trim().min(1, "Enter a plan name.").max(60, "Plan names must be 60 characters or fewer."),
    code: z
      .string()
      .trim()
      .toLowerCase()
      .max(40, "Codes must be 40 characters or fewer.")
      .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, "Codes use lowercase letters, numbers and single dashes, e.g. business-plus."),
    description: z.string().trim().max(500, "Descriptions must be 500 characters or fewer."),
    visibility: z.enum(["standard", "custom"]),
    priceMonthly: money,
    priceYearly: money,
    maxStores: limit("Stores"),
    maxUsers: limit("Users"),
    maxProducts: limit("Products"),
    /** null = every module */
    modules: z.array(z.string().refine((m) => MODULE_KEYS.includes(m), "Unknown module.")).nullable(),
    trialDays: z.number().int().min(0, "Trial days can't be negative.").max(365, "Trials can be at most 365 days."),
    sortOrder: z.number().int().min(-1000).max(1000),
  })
  .refine((p) => p.priceMonthly !== null || p.priceYearly !== null, {
    message: "Enter a monthly or a yearly price (or both).",
    path: ["priceMonthly"],
  });

export type PlanInput = z.input<typeof planSchema>;

export const LIMIT_KINDS = [
  { key: "maxStores", column: "max_stores", label: "Stores" },
  { key: "maxUsers", column: "max_users", label: "Users" },
  { key: "maxProducts", column: "max_products", label: "Products" },
] as const;

/** Monthly/yearly price for display: "PKR 1,200" or "Not offered". */
export const planPriceText = (value: number | null) =>
  value === null ? "Not offered" : `PKR ${value.toLocaleString("en-PK", { maximumFractionDigits: 2 })}`;

export const limitText = (value: number | null) => (value === null ? "Unlimited" : value.toLocaleString("en-PK"));
