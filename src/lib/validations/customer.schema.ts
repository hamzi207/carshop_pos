import { z } from "zod";
import { parsePhone } from "@/lib/phone";
import { parseCnicOrNtn, parseStrn } from "@/lib/tax-id";

// Mirrors the customers.customer_type check constraint.
export const CUSTOMER_TYPES = ["Dealership", "Fleet Account", "Retail Customer"] as const;
export type CustomerType = (typeof CUSTOMER_TYPES)[number];

// Sales tax registration with FBR (customers.tax_registration_status).
export const TAX_REGISTRATION_STATUSES = ["unregistered", "registered"] as const;
export type TaxRegistrationStatus = (typeof TAX_REGISTRATION_STATUSES)[number];

const text = (max: number, label: string) =>
  z.string().trim().max(max, `${label} must be ${max} characters or fewer.`);

/**
 * Phone field per PROJECT_SPEC.md §2.3. Outputs E.164 ("+923001234567"), or ""
 * when an optional field is left empty. WhatsApp numbers must be mobiles.
 */
function phoneField(allowInternational: boolean, { required, whatsapp }: { required: boolean; whatsapp: boolean }) {
  return z.string().transform((value, ctx) => {
    if (!value.trim()) {
      if (required) ctx.addIssue({ code: "custom", message: "Enter a WhatsApp number." });
      return "";
    }
    const parsed = parsePhone(value, allowInternational);
    if (!parsed.ok) {
      ctx.addIssue({ code: "custom", message: parsed.error });
      return z.NEVER;
    }
    if (whatsapp && parsed.kind === "landline") {
      ctx.addIssue({ code: "custom", message: "WhatsApp needs a mobile number (starting 03), not a landline." });
      return z.NEVER;
    }
    return parsed.e164;
  });
}

/** Optional tax number field: normalised, or "" when left empty. */
function taxNumberField(parse: (value: string) => { ok: true; value: string } | { ok: false; error: string }) {
  return z.string().transform((value, ctx) => {
    if (!value.trim()) return "";
    const parsed = parse(value);
    if (!parsed.ok) {
      ctx.addIssue({ code: "custom", message: parsed.error });
      return z.NEVER;
    }
    return parsed.value;
  });
}

/**
 * Built per shop: international numbers depend on the shop's setting.
 * Mirrors customers_tax_identity_check / customers_strn_required_check: business
 * (dealership / fleet) and sales-tax-registered customers need a CNIC or NTN;
 * registered customers also need an STRN.
 */
export function customerSchema(allowInternational: boolean) {
  return z.object({
    name: text(120, "Name").min(2, "Enter the customer or company name."),
    customerType: z.enum(CUSTOMER_TYPES, { error: "Choose a customer type." }),
    contactPerson: text(80, "Contact person"),
    whatsappNumber: phoneField(allowInternational, { required: true, whatsapp: true }),
    phone: phoneField(allowInternational, { required: false, whatsapp: false }),
    email: text(120, "Email")
      .toLowerCase()
      .refine((v) => v === "" || z.email().safeParse(v).success, "Enter a valid email address."),
    billingAddress: text(300, "Billing address"),
    cnicOrNtn: taxNumberField(parseCnicOrNtn),
    taxRegistrationStatus: z.enum(TAX_REGISTRATION_STATUSES),
    strn: taxNumberField(parseStrn),
    creditDays: z
      .number({ error: "Enter a credit period (0 for none)." })
      .int("Use whole days.")
      .min(0, "The credit period can't be negative.")
      .max(365, "Use 365 days or fewer."),
    defaultDiscountPercentage: z
      .number({ error: "Enter a discount (0 for none)." })
      .min(0, "The discount can't be negative.")
      .max(100, "The discount can't be more than 100%."),
    notes: text(1000, "Notes"),
  }).superRefine((c, ctx) => {
    const registered = c.taxRegistrationStatus === "registered";
    if ((c.customerType !== "Retail Customer" || registered) && !c.cnicOrNtn) {
      ctx.addIssue({
        code: "custom",
        path: ["cnicOrNtn"],
        message: registered
          ? "Tax-registered customers need a CNIC or NTN for sales tax invoices."
          : "Dealerships and fleet accounts need a CNIC or NTN for tax invoices.",
      });
    }
    if (registered && !c.strn) {
      ctx.addIssue({ code: "custom", path: ["strn"], message: "Tax-registered customers need an STRN." });
    }
  });
}

/** What the form holds (phones as typed). */
export type CustomerFormValues = z.input<ReturnType<typeof customerSchema>>;
/** After validation (phones in E.164). */
export type CustomerInput = z.output<ReturnType<typeof customerSchema>>;

// URL search params for /customers. Invalid values are dropped, not errors.
export const customerFiltersSchema = z.object({
  search: z.string().trim().max(100).optional().catch(undefined),
  type: z.enum(CUSTOMER_TYPES).optional().catch(undefined),
});

export type CustomerFilters = z.infer<typeof customerFiltersSchema>;
