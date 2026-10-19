import { z } from "zod";

// Settings → Documents (Phase 14): numbering, terms, bank details. Mirrors the tenants checks
// from migration 20261019154032 (prefix format, start numbers, text lengths) and 20261019173257 (≤ 5 wallets).

/** Capitals and digits, optionally hyphenated: "INV", "HAA-INV". Typed lowercase is accepted. */
const prefix = (label: string) =>
  z
    .string()
    .trim()
    .transform((v) => v.toUpperCase())
    .pipe(
      z
        .string()
        .min(1, `Enter a ${label} prefix.`)
        .max(10, "Use 10 characters or fewer.")
        .regex(/^[A-Z0-9]+(-[A-Z0-9]+)*$/, "Use letters and numbers, optionally joined by a hyphen (e.g. HAA-INV)."),
    );

const startNumber = z
  .number({ error: "Enter a number." })
  .int("Use a whole number.")
  .min(1, "Start from 1 or more.")
  .max(99999999, "Use 8 digits or fewer.");

const text = (max: number, label: string) => z.string().trim().max(max, `${label} must be ${max} characters or fewer.`);

/** Pakistani IBAN: PK, 2 check digits, 4-letter bank code, 16 digits (24 characters), checked with mod 97. */
export function normalizeIban(value: string) {
  return value.replace(/[\s-]/g, "").toUpperCase();
}
export function isValidIban(iban: string) {
  if (!/^PK\d{2}[A-Z]{4}\d{16}$/.test(iban)) return false;
  const rearranged = iban.slice(4) + iban.slice(0, 4);
  const digits = rearranged.replace(/[A-Z]/g, (c) => String(c.charCodeAt(0) - 55));
  let rest = 0;
  for (const d of digits) rest = (rest * 10 + Number(d)) % 97;
  return rest === 1;
}
/** "PK36 SCBL 0000 0011 2345 6702" */
export function formatIban(iban: string | null) {
  return iban ? iban.replace(/(.{4})(?=.)/g, "$1 ") : "";
}

const iban = z.string().transform((value, ctx) => {
  const v = normalizeIban(value);
  if (!v) return "";
  if (!/^PK/.test(v)) {
    ctx.addIssue({ code: "custom", message: "A Pakistani IBAN starts with PK, e.g. PK36 SCBL 0000 0011 2345 6702." });
    return z.NEVER;
  }
  if (!isValidIban(v)) {
    ctx.addIssue({ code: "custom", message: "That IBAN isn't valid. It has 24 characters: PK, 2 digits, 4 letters, 16 digits." });
    return z.NEVER;
  }
  return v;
});

const accountNumber = z
  .string()
  .trim()
  .max(40, "Account number must be 40 characters or fewer.")
  .regex(/^[0-9 -]*$/, "Use digits only (spaces and hyphens are fine).");

export const WALLET_PROVIDERS = ["JazzCash", "EasyPaisa", "SadaPay", "NayaPay"] as const;
export type WalletProvider = (typeof WALLET_PROVIDERS)[number];

export const walletSchema = z.object({
  provider: z.enum(WALLET_PROVIDERS, { error: "Choose the wallet." }),
  number: z
    .string()
    .trim()
    .transform((v) => v.replace(/[\s-]/g, ""))
    .pipe(z.string().regex(/^03\d{9}$/, "Enter the wallet's mobile number, e.g. 0300-1234567.")),
  title: text(120, "Account name"),
});
export type Wallet = z.infer<typeof walletSchema>;

export const documentSettingsSchema = z.object({
  quotePrefix: prefix("quotation"),
  quoteStart: startNumber,
  invoicePrefix: prefix("invoice"),
  invoiceStart: startNumber,
  draftPrefix: prefix("draft"),
  draftStart: startNumber,
  quoteTerms: text(2000, "Quotation terms"),
  invoiceTerms: text(2000, "Invoice terms"),
  bankName: text(120, "Bank name"),
  bankAccountTitle: text(120, "Account title"),
  bankAccountNumber: accountNumber,
  bankIban: iban,
  bankRaastId: text(40, "Raast ID"),
  wallets: z.array(walletSchema).max(5, "Add up to 5 wallets."),
});
export type DocumentSettingsValues = z.input<typeof documentSettingsSchema>;

/** Stored tenants.bank_wallets → wallets, dropping anything malformed. */
export function parseWallets(value: unknown): Wallet[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((w) => {
    const r = walletSchema.safeParse(w);
    return r.success ? [r.data] : [];
  });
}

/** "0300-1234567" */
export function formatWalletNumber(n: string) {
  return /^03\d{9}$/.test(n) ? `${n.slice(0, 4)}-${n.slice(4)}` : n;
}

/** Next number in a series: the same rule as next_document_number (never goes back, never reuses). */
export function nextDocumentNumber(prefix: string, start: number, highestUsed: number) {
  const s = Number.isFinite(start) && start >= 1 ? Math.floor(start) : 1;
  return `${prefix || "?"}-${Math.max(highestUsed, s - 1) + 1}`;
}
