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
    statuses: ["invoiced", "paid"],
    stage: "invoice",
    newLabel: "New Invoice",
  },
};

export const STATUS_LABEL: Record<string, string> = {
  draft: "Draft",
  sent: "Sent",
  accepted: "Accepted",
  cancelled: "Cancelled",
  invoiced: "Unpaid",
  paid: "Paid",
};

export const STATUS_TONE: Record<string, string> = {
  draft: "",
  sent: "badge-blue",
  accepted: "badge-purple",
  cancelled: "badge-red",
  invoiced: "badge-amber",
  paid: "badge-green",
};

export function sectionForStatus(status: string): DocumentSection {
  if (status === "draft") return "drafts";
  if (status === "invoiced" || status === "paid") return "invoices";
  return "quotations";
}

export function documentHref(doc: { id: string; status: string }) {
  return `${SECTION[sectionForStatus(doc.status)].path}/${doc.id}`;
}

/** Paid and cancelled documents are kept as they are. */
export function isEditable(status: string) {
  return status !== "paid" && status !== "cancelled";
}

/** Earlier numbers a document went by, newest first: "from Q-1004 · D-1002". */
export function earlierNumbers(doc: {
  status: string;
  draft_number: string | null;
  quotation_number: string | null;
}) {
  const section = sectionForStatus(doc.status);
  const numbers =
    section === "invoices" ? [doc.quotation_number, doc.draft_number]
    : section === "quotations" ? [doc.draft_number]
    : [];
  return numbers.filter((n): n is string => Boolean(n));
}
