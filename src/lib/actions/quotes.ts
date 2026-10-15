"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { SECTION, sectionForStatus, type DocumentSection, type DocumentStage } from "@/lib/documents";
import type { DocumentListItem, QuoteDocument } from "@/lib/types/quote";
import {
  DOCUMENT_STAGES,
  documentFiltersSchema,
  quoteSchema,
  type DocumentFilters,
  type QuoteInput,
} from "@/lib/validations/quote.schema";

// Every query runs with the caller's session, so RLS limits it to their own
// shop. Totals and numbers are worked out in SQL (save_quote / convert_quote),
// never taken from the client.

export type QuoteActionResult =
  | { status: "success"; id: string; section: DocumentSection; number: string }
  | { status: "error"; message: string };

const idSchema = z.uuid();
const stageSchema = z.enum(DOCUMENT_STAGES);

const LIST_SELECT =
  "id, quote_number, draft_number, quotation_number, status, total_amount, created_at, updated_at, quoted_at, invoiced_at, custom_vehicle_notes, customers(id, name, customer_type), vehicles(year, make, model, trim)";

// The time each section sorts and dates its documents by.
const SECTION_DATE = {
  drafts: "updated_at",
  quotations: "quoted_at",
  invoices: "invoiced_at",
} as const satisfies Record<DocumentSection, keyof DocumentListItem>;

/** One section's documents, newest first. Search matches number, customer or vehicle. */
export async function getDocuments(section: DocumentSection, filters: DocumentFilters = {}): Promise<DocumentListItem[]> {
  const { search, status } = documentFiltersSchema.parse(filters);
  const statuses = SECTION[section].statuses;
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("quotes")
    .select(LIST_SELECT)
    .in("status", status && statuses.includes(status) ? [status] : [...statuses])
    .order(SECTION_DATE[section], { ascending: false })
    .order("created_at", { ascending: false })
    .limit(1000);

  if (error) {
    console.error("getDocuments failed:", error.message);
    throw new Error("Could not load documents.");
  }

  const rows: DocumentListItem[] = data.map(({ customers, vehicles, ...doc }) => ({
    ...doc,
    total_amount: Number(doc.total_amount),
    customer: customers,
    vehicle: vehicles,
  }));
  if (!search) return rows;

  // Every word must match somewhere: "q-1004", "apex", "corolla 2025".
  const words = search.toLowerCase().split(/\s+/).filter(Boolean);
  return rows.filter((d) => {
    const text = [
      d.quote_number,
      d.draft_number,
      d.quotation_number,
      d.customer?.name,
      d.vehicle && `${d.vehicle.year} ${d.vehicle.make} ${d.vehicle.model} ${d.vehicle.trim ?? ""}`,
      d.custom_vehicle_notes,
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    return words.every((w) => text.includes(w));
  });
}

/** One document with its lines (in order), or null when it doesn't exist. */
export async function getQuote(id: string): Promise<QuoteDocument | null> {
  if (!idSchema.safeParse(id).success) return null;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("quotes")
    .select(
      "*, customers(id, name, customer_type, whatsapp_number), vehicles(id, year, make, model, trim), quote_items(*, inventory_items(sku, quantity_on_hand))",
    )
    .eq("id", id)
    .order("sort_order", { referencedTable: "quote_items" })
    .maybeSingle();

  if (error) {
    console.error("getQuote failed:", error.message);
    throw new Error("Could not load this document.");
  }
  if (!data) return null;

  const { customers, vehicles, quote_items, ...quote } = data;
  return {
    ...quote,
    customer: customers,
    vehicle: vehicles,
    lines: quote_items.map(({ inventory_items, ...line }) => ({
      ...line,
      quantity: Number(line.quantity),
      unit_price: Number(line.unit_price),
      sku: inventory_items?.sku ?? null,
      quantityOnHand: inventory_items?.quantity_on_hand ?? null,
    })),
  };
}

function dbError(error: { code?: string; message: string }, action: string): QuoteActionResult {
  switch (error.code) {
    // Raised by save_quote / convert_quote with messages written for users.
    case "22023":
    case "23503":
    case "55000":
    case "P0002":
      return { status: "error", message: error.message };
    case "42501":
      return { status: "error", message: "Your session has expired. Please sign in again." };
    default:
      console.error(`${action} failed:`, error);
      return { status: "error", message: "We couldn't save this document. Please try again." };
  }
}

type SavedRow = { id: string; status: string; quote_number: string };

const success = (row: SavedRow): QuoteActionResult => ({
  status: "success",
  id: row.id,
  section: sectionForStatus(row.status),
  number: row.quote_number,
});

/**
 * Creates (no id) or updates a document, then moves it to `stage` when that's
 * a step forward: Draft → Quotation, Draft → Invoice, Quotation → Invoice.
 */
export async function saveQuote(id: string | null, input: QuoteInput, stage: DocumentStage): Promise<QuoteActionResult> {
  if (id !== null && !idSchema.safeParse(id).success) return { status: "error", message: "Invalid document." };
  if (!stageSchema.safeParse(stage).success) return { status: "error", message: "Unknown document type." };
  const parsed = quoteSchema.safeParse(input);
  if (!parsed.success) {
    return { status: "error", message: parsed.error.issues[0]?.message ?? "Check the document and try again." };
  }
  const q = parsed.data;

  const supabase = await createClient();
  const { data: saved, error } = await supabase.rpc("save_quote", {
    p_quote_id: id ?? undefined,
    p_stage: stage,
    p_customer_id: q.customerId,
    p_vehicle_id: q.vehicleId ?? undefined,
    p_custom_vehicle_notes: q.customVehicleNotes || undefined,
    p_discount_type: q.discountType,
    p_discount_value: q.discountValue,
    p_notes: q.notes || undefined,
    p_items: q.lines.map((l) => ({
      item_id: l.isLabor ? null : l.itemId,
      description: l.description,
      is_labor: l.isLabor,
      quantity: l.quantity,
      unit_price: l.unitPrice,
    })),
  });
  if (error) return dbError(error, "saveQuote");

  let row: SavedRow = saved;
  const current = sectionForStatus(row.status);
  const convertTo =
    (stage === "quotation" && current === "drafts") || (stage === "invoice" && current !== "invoices") ? stage : null;
  if (convertTo) {
    const converted = await supabase.rpc("convert_quote", { p_quote_id: row.id, p_target: convertTo });
    if (converted.error) {
      refresh();
      const failed = dbError(converted.error, "convertQuote");
      return failed.status === "error"
        ? { status: "error", message: `Saved as ${row.quote_number}, but it couldn't be converted: ${failed.message}` }
        : failed;
    }
    row = converted.data;
  }

  refresh();
  return success(row);
}

/** One-click conversion: Draft → Quotation, Draft → Invoice, Quotation → Invoice. */
export async function convertQuote(id: string, target: "quotation" | "invoice"): Promise<QuoteActionResult> {
  if (!idSchema.safeParse(id).success) return { status: "error", message: "Invalid document." };
  if (target !== "quotation" && target !== "invoice") return { status: "error", message: "Unknown conversion." };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("convert_quote", { p_quote_id: id, p_target: target });
  if (error) return dbError(error, "convertQuote");

  refresh();
  return success(data);
}

// Quotation status moves: accept, cancel, or re-open a cancelled one.
const QUOTATION_MOVES = {
  accepted: ["sent"],
  cancelled: ["sent", "accepted"],
  sent: ["accepted", "cancelled"],
} as const;

export async function setQuotationStatus(id: string, status: keyof typeof QUOTATION_MOVES): Promise<QuoteActionResult> {
  if (!idSchema.safeParse(id).success || !(status in QUOTATION_MOVES)) {
    return { status: "error", message: "Invalid request." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("quotes")
    .update({ status, updated_at: new Date().toISOString() })
    .eq("id", id)
    .in("status", [...QUOTATION_MOVES[status]])
    .select("id, status, quote_number");
  if (error) return dbError(error, "setQuotationStatus");
  if (data.length === 0) {
    return { status: "error", message: "This quotation has changed since you opened it. Reload and try again." };
  }

  refresh();
  return success(data[0]);
}

/** Only drafts can be deleted (RLS policy); their lines cascade. */
export async function deleteDraft(id: string): Promise<{ status: "success" } | { status: "error"; message: string }> {
  if (!idSchema.safeParse(id).success) return { status: "error", message: "Invalid document." };

  const supabase = await createClient();
  const { data, error } = await supabase.from("quotes").delete().eq("id", id).eq("status", "draft").select("id");
  if (error) {
    console.error("deleteDraft failed:", error);
    return { status: "error", message: "We couldn't delete this draft. Please try again." };
  }
  if (data.length === 0) {
    return { status: "error", message: "Only drafts can be deleted. This one may already be gone or converted." };
  }

  refresh();
  return { status: "success" };
}
