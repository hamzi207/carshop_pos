// Drafts / Quotations / Invoices: one quotes row at different stages
// (PROJECT_SPEC.md Phase 5, step 4). Shared by server and client code.

export const SECTIONS = ["drafts", "quotations", "invoices"] as const;
export type DocumentSection = (typeof SECTIONS)[number];

/** What a save turns the document into (save_quote p_stage / convert_quote p_target). */
export type DocumentStage = "draft" | "quotation" | "invoice";

type SectionConfig = {
  title: string;
  /** "Draft D-1001", "Quotation Q-1004", "Invoice INV-1007". */
  singular: string;
  eyebrow: string;
  description: string;
  path: `/${DocumentSection}`;
  /** Stored statuses shown in this section. */
  statuses: readonly string[];
  stage: DocumentStage;
  newLabel: string;
};

export const SECTION: Record<DocumentSection, SectionConfig> = {
  drafts: {
    title: "Drafts",
    singular: "Draft",
    eyebrow: "WORK IN PROGRESS",
    description: "Unfinished quotes and bills. Turn one into a quotation or an invoice when it's ready.",
    path: "/drafts",
    statuses: ["draft"],
    stage: "draft",
    newLabel: "New Draft",
  },
  quotations: {
    title: "Quotations",
    singular: "Quotation",
    eyebrow: "SALES PIPELINE",
    description: "Prices offered to customers. Convert an accepted quotation into an invoice in one click.",
    path: "/quotations",
    statuses: ["sent", "accepted", "cancelled"],
    stage: "quotation",
    newLabel: "New Quotation",
  },
  invoices: {
    title: "Invoices",
    singular: "Invoice",
    eyebrow: "BILLING",
    description: "Bills issued to customers, including direct walk-in sales.",
    path: "/invoices",
    statuses: ["invoiced", "paid", "void"],
    stage: "invoice",
    newLabel: "New Invoice",
  },
};

// ---- Statuses -----------------------------------------------------------------
// Invoices store invoiced / paid / void; what people see is derived from the
// payments and the due date: Pending, Due, Partially Paid, Paid, Cancelled.

export type StatusKey =
  | "draft"
  | "sent"
  | "accepted"
  | "cancelled"
  | "pending"
  | "due"
  | "partial"
  | "paid"
  | "void";

const STATUS_DISPLAY: Record<StatusKey, { label: string; tone: string }> = {
  draft: { label: "Draft", tone: "" },
  sent: { label: "Sent", tone: "badge-blue" },
  accepted: { label: "Accepted", tone: "badge-purple" },
  cancelled: { label: "Cancelled", tone: "badge-red" },
  pending: { label: "Pending / Unpaid", tone: "badge-amber" },
  due: { label: "Due", tone: "badge-red" },
  partial: { label: "Partially Paid", tone: "badge-purple" },
  paid: { label: "Paid", tone: "badge-green" },
  void: { label: "Cancelled", tone: "" },
};

/** Invoice list filters, in display order. */
export const INVOICE_FILTERS: readonly StatusKey[] = ["pending", "due", "partial", "paid", "void"];
export const QUOTATION_FILTERS: readonly StatusKey[] = ["sent", "accepted", "cancelled"];

type StatusSource = { status: string; amount_paid: number | string; due_date: string | null };

/**
 * What a document's status is right now. `today` is the shop's local date
 * (YYYY-MM-DD), worked out on the server so it follows the shop timezone.
 */
export function statusKey(doc: StatusSource, today: string): StatusKey {
  switch (doc.status) {
    case "paid":
      return "paid";
    case "void":
      return "void";
    case "invoiced":
      if (Number(doc.amount_paid) > 0) return "partial";
      return doc.due_date && doc.due_date < today ? "due" : "pending";
    case "draft":
    case "sent":
    case "accepted":
    case "cancelled":
      return doc.status;
    default:
      return "draft";
  }
}

export function statusDisplay(key: StatusKey) {
  return STATUS_DISPLAY[key];
}

export function sectionForStatus(status: string): DocumentSection {
  if (status === "draft") return "drafts";
  if (status === "invoiced" || status === "paid" || status === "void") return "invoices";
  return "quotations";
}

export function documentHref(doc: { id: string; status: string }) {
  return `${SECTION[sectionForStatus(doc.status)].path}/${doc.id}`;
}

/** Paid and cancelled documents are kept as they are. */
export function isEditable(status: string) {
  return status !== "paid" && status !== "cancelled" && status !== "void";
}

/** Anything without payments can be deleted; deleting gives back its stock. */
export function isDeletable(doc: { status: string; amount_paid: number | string }) {
  return doc.status !== "paid" && Number(doc.amount_paid) === 0;
}

/** An open quotation past its validity date (its stock stays reserved). */
export function isExpired(doc: { status: string; valid_until: string | null }) {
  return (doc.status === "sent" || doc.status === "accepted") && doc.valid_until !== null && new Date(doc.valid_until) < new Date();
}

/** Who a document is for: the customer, or the walk-in buyer's name. */
export function customerLabel(doc: { walk_in_name: string | null }, customer: { name: string; is_walk_in: boolean } | null) {
  if (!customer) return "—";
  if (customer.is_walk_in) return doc.walk_in_name ? `${doc.walk_in_name} (walk-in)` : "Walk-in / Cash Customer";
  return customer.name;
}

/** Earlier numbers a document went by, newest first: "from Q-1004 · D-1002". */
export function earlierNumbers(doc: {
  status: string;
  draft_number: string | null;
  quotation_number: string | null;
}) {
  const section = sectionForStatus(doc.status);
  // A draft keeps the Q- number of a quotation it was moved back from.
  const numbers =
    section === "invoices" ? [doc.quotation_number, doc.draft_number]
    : section === "quotations" ? [doc.draft_number]
    : [doc.quotation_number];
  return numbers.filter((n): n is string => Boolean(n));
}

/** The calendar date (YYYY-MM-DD) in a timezone: today, or of a given moment. For server use. */
export function localDate(timeZone: string, at: string | Date = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(at));
}

/** YYYY-MM-DD plus whole days (calendar arithmetic, no timezone involved). */
export function addDays(day: string, days: number) {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Number series prefix per section (next_document_number). */
export const NUMBER_PREFIX: Record<DocumentSection, "D" | "Q" | "INV"> = { drafts: "D", quotations: "Q", invoices: "INV" };

export const PAYMENT_METHODS = ["Cash", "Card Terminal", "Bank Transfer", "Check"] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];
