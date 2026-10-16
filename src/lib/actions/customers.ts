"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { getShopSession } from "@/lib/auth";
import { isRangePastEnd, pageRange, type Paged, type Pagination } from "@/lib/pagination";
import { createClient } from "@/lib/supabase/server";
import type { CustomerDetail, CustomerListItem } from "@/lib/types/customer";
import {
  customerFiltersSchema,
  customerSchema,
  type CustomerFilters,
  type CustomerFormValues,
  type CustomerInput,
} from "@/lib/validations/customer.schema";

// Every query runs with the caller's session, so RLS limits it to their own
// shop. tenant_id always comes from the session, never from the client.

export type CustomerActionResult =
  | { status: "success"; id: string }
  | { status: "error"; message: string; field?: keyof CustomerInput };

const idSchema = z.uuid();

const LIST_SELECT = "*, quotes(status, total_amount, amount_paid)";

// Unpaid (or part-paid) invoices; what is owed is the total minus payments.
const isOutstanding = (status: string) => status === "invoiced";
const owed = (q: { total_amount: number | string; amount_paid: number | string }) => Number(q.total_amount) - Number(q.amount_paid);
const isCancelled = (status: string) => status === "cancelled" || status === "void";

/** One page of the directory (A–Z). Each row's activity comes from its own documents. */
export async function getCustomers(filters: CustomerFilters = {}, pagination: Pagination = { page: 1, limit: 25 }): Promise<Paged<CustomerListItem>> {
  const { search, type } = customerFiltersSchema.parse(filters);
  const supabase = await createClient();

  // Search runs in SQL (search_customers) so phone numbers match whether typed
  // as 0300-1234567 or +92 300 1234567. A builder is single-use, hence a function.
  const build = () => {
    let query = (
      search
        ? supabase.rpc("search_customers", { p_query: search }, { count: "exact" }).select(LIST_SELECT)
        : supabase.from("customers").select(LIST_SELECT, { count: "exact" })
    )
      // The shop's walk-in / cash record isn't a directory entry.
      .eq("is_walk_in", false);
    if (type) query = query.eq("customer_type", type);
    return query.order("name").order("id");
  };

  const { from, to } = pageRange(pagination);
  let { data, count, error } = await build().range(from, to);
  if (isRangePastEnd(error)) {
    // Asked for a page past the end: report the total so the page can redirect.
    ({ count, error } = await build().range(0, 0));
    data = [];
  }
  if (error) {
    console.error("getCustomers failed:", error.message);
    throw new Error("Could not load customers.");
  }

  const rows = (data ?? []).map(({ quotes, ...customer }) => ({
    ...customer,
    quoteCount: quotes.filter((q) => !isCancelled(q.status)).length,
    outstanding: quotes.filter((q) => isOutstanding(q.status)).reduce((sum, q) => sum + owed(q), 0),
  }));
  return { rows, total: count ?? 0, ...pagination };
}

export type CustomerStats = { total: number; b2b: number; outstanding: number };

/** Totals for the whole directory (the summary tiles), whatever the filters or page. */
export async function getCustomerStats(): Promise<CustomerStats> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("customer_directory_stats").single();
  if (error) {
    console.error("getCustomerStats failed:", error.message);
    throw new Error("Could not load customers.");
  }
  return { total: Number(data.total), b2b: Number(data.b2b), outstanding: Number(data.outstanding) };
}

/** One customer with their full quote / invoice history (newest first), or null. */
export async function getCustomer(id: string): Promise<CustomerDetail | null> {
  if (!idSchema.safeParse(id).success) return null;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("customers")
    .select(
      "*, quotes(id, quote_number, status, total_amount, amount_paid, due_date, created_at, walk_in_name)",
    )
    .eq("id", id)
    .order("created_at", { referencedTable: "quotes", ascending: false })
    .maybeSingle();

  if (error) {
    console.error("getCustomer failed:", error.message);
    throw new Error("Could not load this customer.");
  }
  if (!data) return null;

  const { quotes, ...customer } = data;
  return {
    ...customer,
    quotes: quotes.map((q) => ({ ...q, total_amount: Number(q.total_amount), amount_paid: Number(q.amount_paid) })),
    outstanding: quotes.filter((q) => isOutstanding(q.status)).reduce((sum, q) => sum + owed(q), 0),
  };
}

/** Validates against the shop's *current* phone setting, read on the server. */
async function validate(input: CustomerFormValues) {
  const session = await getShopSession();
  const parsed = customerSchema(session.tenant.allowInternationalPhones).safeParse(input);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return {
      session,
      error: {
        status: "error",
        message: issue?.message ?? "Check the highlighted fields.",
        field: issue?.path[0] as keyof CustomerInput | undefined,
      } satisfies CustomerActionResult,
    };
  }
  return { session, data: parsed.data };
}

const toRow = (c: CustomerInput) => ({
  name: c.name,
  customer_type: c.customerType,
  contact_person: c.contactPerson || null,
  whatsapp_number: c.whatsappNumber,
  phone: c.phone || null,
  email: c.email || null,
  billing_address: c.billingAddress || null,
  cnic_or_ntn: c.cnicOrNtn || null,
  tax_registration_status: c.taxRegistrationStatus,
  strn: c.taxRegistrationStatus === "registered" ? c.strn || null : null,
  default_discount_percentage: Math.round(c.defaultDiscountPercentage * 100) / 100,
  credit_days: c.creditDays,
  notes: c.notes || null,
});

// Check constraints the form also validates, in case the two ever drift.
const CONSTRAINT_ERRORS: Record<string, { field: keyof CustomerInput; message: string }> = {
  customers_tax_identity_check: { field: "cnicOrNtn", message: "This customer needs a CNIC or NTN for tax invoices." },
  customers_strn_required_check: { field: "strn", message: "Tax-registered customers need an STRN." },
  customers_cnic_or_ntn_format_check: { field: "cnicOrNtn", message: "Enter a valid CNIC or NTN." },
  customers_strn_format_check: { field: "strn", message: "An STRN has 13 digits." },
};

function dbError(error: { code?: string; message: string }, action: string): CustomerActionResult {
  console.error(`${action} failed:`, error);
  if (error.code === "23514") {
    const known = Object.entries(CONSTRAINT_ERRORS).find(([name]) => error.message.includes(name));
    if (known) return { status: "error", ...known[1] };
    return { status: "error", message: "A phone number isn't in a valid format.", field: "whatsappNumber" };
  }
  return { status: "error", message: "We couldn't save this customer. Please try again." };
}

export async function createCustomer(input: CustomerFormValues): Promise<CustomerActionResult> {
  const v = await validate(input);
  if (v.error) return v.error;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("customers")
    .insert({ tenant_id: v.session.tenant.id, ...toRow(v.data) })
    .select("id")
    .single();
  if (error) return dbError(error, "createCustomer");

  refresh();
  return { status: "success", id: data.id };
}

export async function updateCustomer(id: string, input: CustomerFormValues): Promise<CustomerActionResult> {
  if (!idSchema.safeParse(id).success) return { status: "error", message: "Invalid customer." };
  const v = await validate(input);
  if (v.error) return v.error;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("customers")
    .update({ ...toRow(v.data), updated_at: new Date().toISOString() })
    .eq("id", id)
    .select("id");
  if (error) return dbError(error, "updateCustomer");
  if (data.length === 0) {
    return { status: "error", message: "This customer no longer exists. They may have been deleted." };
  }

  refresh();
  return { status: "success", id };
}

/** Customers with quotes can't be deleted (quotes.customer_id is ON DELETE RESTRICT). */
export async function deleteCustomer(id: string): Promise<CustomerActionResult> {
  if (!idSchema.safeParse(id).success) return { status: "error", message: "Invalid customer." };

  const supabase = await createClient();
  const { data, error } = await supabase.from("customers").delete().eq("id", id).select("id");
  if (error) {
    if (error.code === "23503") {
      return {
        status: "error",
        message: "This customer has quotes or invoices, so they can't be deleted. Their history must be kept.",
      };
    }
    console.error("deleteCustomer failed:", error);
    return { status: "error", message: "We couldn't delete this customer. Please try again." };
  }
  if (data.length === 0) {
    return { status: "error", message: "This customer no longer exists. They may have been deleted." };
  }

  refresh();
  return { status: "success", id };
}
