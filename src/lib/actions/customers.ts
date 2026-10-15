"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { getShopSession } from "@/lib/auth";
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

const LIST_SELECT = "*, quotes(status, total_amount)";

const isOutstanding = (status: string) => status === "invoiced";

export async function getCustomers(filters: CustomerFilters = {}): Promise<CustomerListItem[]> {
  const { search, type } = customerFiltersSchema.parse(filters);
  const supabase = await createClient();

  // Search runs in SQL (search_customers) so phone numbers match whether typed
  // as 0300-1234567 or +92 300 1234567.
  let query = (
    search
      ? supabase.rpc("search_customers", { p_query: search }).select(LIST_SELECT)
      : supabase.from("customers").select(LIST_SELECT)
  ).order("name");
  if (type) query = query.eq("customer_type", type);

  const { data, error } = await query;
  if (error) {
    console.error("getCustomers failed:", error.message);
    throw new Error("Could not load customers.");
  }

  return data.map(({ quotes, ...customer }) => ({
    ...customer,
    quoteCount: quotes.filter((q) => q.status !== "cancelled").length,
    outstanding: quotes
      .filter((q) => isOutstanding(q.status))
      .reduce((sum, q) => sum + Number(q.total_amount), 0),
  }));
}

/** One customer with their full quote / invoice history (newest first), or null. */
export async function getCustomer(id: string): Promise<CustomerDetail | null> {
  if (!idSchema.safeParse(id).success) return null;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("customers")
    .select(
      "*, quotes(id, quote_number, status, total_amount, created_at, custom_vehicle_notes, vehicles(year, make, model, trim))",
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
    quotes: quotes.map(({ vehicles, ...q }) => ({ ...q, total_amount: Number(q.total_amount), vehicle: vehicles })),
    outstanding: quotes
      .filter((q) => isOutstanding(q.status))
      .reduce((sum, q) => sum + Number(q.total_amount), 0),
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
  tax_id: c.taxId || null,
  notes: c.notes || null,
});

function dbError(error: { code?: string; message: string }, action: string): CustomerActionResult {
  console.error(`${action} failed:`, error);
  if (error.code === "23514") {
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
