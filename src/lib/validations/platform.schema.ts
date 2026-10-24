import { z } from "zod";

// /admin/platform (Phase 17, deliverable 5): the single platform_settings row and announcements.
// Limits match the table's check constraints.

const optional = (max: number, label: string) =>
  z.string().trim().max(max, `${label} is too long.`).transform((v) => (v === "" ? null : v));

const days = (label: string) => z.coerce.number({ error: `${label}: enter a number.` }).int(`${label}: whole days.`).min(0, `${label}: 0 or more.`).max(60, `${label}: 60 at most.`);

export const platformSettingsSchema = z.object({
  businessName: z.string().trim().min(1, "Enter the business name.").max(120),
  businessAddress: optional(300, "Address"),
  businessPhone: optional(30, "Phone"),
  businessEmail: z.union([z.literal(""), z.email("Enter a valid email.")]).transform((v) => (v === "" ? null : v)),
  businessNtn: optional(30, "NTN"),
  wallets: z
    .array(
      z.object({
        provider: z.string().trim().min(1, "Name the wallet (e.g. JazzCash).").max(40),
        title: z.string().trim().min(1, "Enter the account title.").max(80),
        number: z.string().trim().min(5, "Enter the wallet number.").max(30),
      }),
    )
    .max(6, "Up to 6 wallets."),
  banks: z
    .array(
      z.object({
        bank: z.string().trim().min(1, "Enter the bank.").max(80),
        title: z.string().trim().min(1, "Enter the account title.").max(80),
        number: z.string().trim().min(5, "Enter the account number.").max(40),
        iban: z
          .string()
          .trim()
          .transform((v) => v.replace(/\s+/g, "").toUpperCase())
          .refine((v) => v === "" || /^PK\d{2}[A-Z]{4}\d{16}$/.test(v), "IBANs look like PK36SCBL0000001123456702."),
      }),
    )
    .max(6, "Up to 6 bank accounts."),
  paymentNote: optional(500, "Payment note"),
  invoiceLeadDays: days("Invoice lead days"),
  defaultGraceDays: days("Grace days"),
  reminderDays: z
    .string()
    .trim()
    .transform((v, ctx) => {
      const parts = v === "" ? [] : v.split(/[\s,]+/).filter(Boolean).map(Number);
      if (parts.some((n) => !Number.isInteger(n) || n < 0 || n > 60)) {
        ctx.addIssue({ code: "custom", message: "Reminder days: whole numbers from 0 to 60, separated by commas." });
        return z.NEVER;
      }
      if (parts.length > 6) {
        ctx.addIssue({ code: "custom", message: "Up to 6 reminders." });
        return z.NEVER;
      }
      return [...new Set(parts)].sort((a, b) => b - a);
    }),
  defaultPlanId: z.union([z.literal(""), z.uuid()]).transform((v) => (v === "" ? null : v)),
  signupDefaultStatus: z.enum(["active", "trial"]),
  impersonationTtlMinutes: z.coerce.number().int().min(15, "Login As: at least 15 minutes.").max(720, "Login As: 12 hours at most."),
  emailSenderName: z.string().trim().min(1, "Enter the sender name.").max(80),
  emailReplyTo: z.union([z.literal(""), z.email("Enter a valid reply-to email.")]).transform((v) => (v === "" ? null : v)),
  emailHourlyLimit: z.coerce.number().int().min(1).max(10000, "10,000 emails an hour at most."),
});
export type PlatformSettingsInput = z.input<typeof platformSettingsSchema>;

export const announcementSchema = z
  .object({
    message: z.string().trim().min(1, "Write the message.").max(500, "Keep it under 500 characters."),
    tone: z.enum(["info", "warning"]),
    /** Empty = every organization. */
    tenantIds: z.array(z.uuid()).max(200),
    /** datetime-local values in Pakistan time ("2026-10-21T09:00"), or "" for now / no end. */
    startsAt: z.string(),
    endsAt: z.string(),
  })
  .refine((v) => !v.endsAt || !v.startsAt || v.endsAt > v.startsAt, { path: ["endsAt"], message: "The end must be after the start." });
export type AnnouncementInput = z.input<typeof announcementSchema>;
