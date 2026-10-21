import { z } from "zod";
import { MODULE_KEYS } from "@/lib/modules";
import { PAYMENT_METHOD_KEYS } from "@/lib/subscription";

// Subscriptions (Phase 17, deliverable 9): the organization's Subscription tab in the console and
// the organization admin's "I've paid".

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Enter a date.");
const reason = z.string().trim().min(3, "Say why (it goes in the history).").max(300, "Keep the reason under 300 characters.");
const limit = z.number().int("Limits are whole numbers.").min(1, "Limits are at least 1, or empty for the plan's.").max(1_000_000).nullable();

export const changePlanSchema = z.object({
  planId: z.uuid("Choose a plan."),
  cycle: z.enum(["monthly", "yearly"]),
  /** now: from today; next_period: from the next invoice. */
  when: z.enum(["now", "next_period"]),
  /** Only with "now": restart as a trial of the plan's length, or bill from today. */
  startAs: z.enum(["keep", "trial", "active"]),
  /** Keep the organization's agreed price and discount (otherwise the new plan's price applies). */
  keepPrice: z.boolean(),
  reason,
});
export type ChangePlanInput = z.input<typeof changePlanSchema>;

export const pricingSchema = z
  .object({
    /** null = the plan's price for the cycle */
    agreedPrice: z.number().min(0, "Prices can't be negative.").max(10_000_000).nullable(),
    discountType: z.enum(["none", "amount", "percent"]),
    discountValue: z.number().min(0, "Discounts can't be negative.").max(10_000_000),
    priceNote: z.string().trim().max(300, "Keep the note under 300 characters."),
    maxStores: limit,
    maxUsers: limit,
    maxProducts: limit,
    /** undefined/null = the plan's modules */
    modules: z.array(z.string().refine((m) => MODULE_KEYS.includes(m), "Unknown module.")).nullable(),
    graceDays: z.number().int().min(0, "Grace days can't be negative.").max(60, "Grace days are at most 60."),
    autoSuspend: z.boolean(),
    reason,
  })
  .refine((p) => p.discountType !== "percent" || p.discountValue <= 100, { message: "A percentage discount is at most 100.", path: ["discountValue"] });
export type PricingInput = z.input<typeof pricingSchema>;

export const extendSchema = z.object({ until: date, reason });

export const adjustmentSchema = z.object({
  description: z.string().trim().min(1, "Describe the charge or credit.").max(200, "Keep it under 200 characters."),
  /** positive = charge, negative = credit */
  amount: z.number().refine((n) => n !== 0 && Math.abs(n) <= 10_000_000, "Enter an amount (negative for a credit)."),
});

// No part payments: the amount is always the invoice's full amount due (checked again in SQL).
const paymentFields = {
  paidOn: date,
  method: z.enum(PAYMENT_METHOD_KEYS),
  reference: z.string().trim().max(100, "Keep the reference under 100 characters."),
  payerName: z.string().trim().max(120, "Keep the name under 120 characters."),
  note: z.string().trim().max(500, "Keep the note under 500 characters."),
};

/** The superadmin records a payment (the reference is optional for cash). */
export const recordPaymentSchema = z
  .object({ invoiceId: z.uuid(), ...paymentFields })
  .refine((p) => p.method === "cash" || p.reference.length > 0, { message: "Enter the transaction ID or reference.", path: ["reference"] });
export type RecordPaymentInput = z.input<typeof recordPaymentSchema>;

/** The organization's admin reports a payment ("I've paid"). */
export const submitPaymentSchema = z.object({
  invoiceId: z.uuid(),
  ...paymentFields,
  method: z.enum(PAYMENT_METHOD_KEYS).refine((m) => m !== "cash", "Choose how you paid."),
  reference: z.string().trim().min(1, "Enter the transaction ID.").max(100, "Keep the transaction ID under 100 characters."),
});
export type SubmitPaymentInput = z.input<typeof submitPaymentSchema>;

export const PROOF_TYPES = ["image/png", "image/jpeg", "image/webp", "application/pdf"];
export const PROOF_MAX_BYTES = 5 * 1024 * 1024;

/** A screenshot or receipt file, if any. Returns an error message or null. */
export function proofError(file: File | null) {
  if (!file || file.size === 0) return null;
  if (!PROOF_TYPES.includes(file.type)) return "The screenshot must be a PNG, JPG, WebP or PDF file.";
  if (file.size > PROOF_MAX_BYTES) return "The screenshot must be 5 MB or smaller.";
  return null;
}
