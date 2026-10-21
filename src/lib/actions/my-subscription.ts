"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { getShopSession } from "@/lib/auth";
import { deliverSubscriptionEvents } from "@/lib/subscription-emails";
import { uploadProof } from "@/lib/subscription-proofs";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { submitPaymentSchema } from "@/lib/validations/subscription.schema";

// The organization admin's side of the subscription (Phase 17, deliverable 9): report a payment
// ("I've paid") and ask for a plan change. Both work while the organization is suspended for
// non-payment (/subscription-due), so they don't go through getShopSession() there.

export type MySubscriptionResult = { status: "success"; message: string } | { status: "error"; message: string };

const fail = (message: string): MySubscriptionResult => ({ status: "error", message });
const text = (form: FormData, key: string) => String(form.get(key) ?? "");

/** "I've paid": a pending payment with an optional screenshot, checked by ProductLogik. */
export async function submitSubscriptionPayment(form: FormData): Promise<MySubscriptionResult> {
  const parsed = submitPaymentSchema.safeParse({
    invoiceId: text(form, "invoiceId"),
    paidOn: text(form, "paidOn"),
    method: text(form, "method"),
    reference: text(form, "reference"),
    payerName: text(form, "payerName"),
    note: text(form, "note"),
  });
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Check the payment details.");
  const v = parsed.data;

  const supabase = await createClient();
  // The caller's organization if they're one of its active admins (null otherwise); also a superadmin acting as it.
  const { data: billing } = await supabase.rpc("my_subscription");
  const mine = billing as { tenant?: { id?: string }; invoices?: { id: string; total: number; amountPaid: number }[] } | null;
  const tenantId = mine?.tenant?.id;
  if (!tenantId) return fail("Only the organization's admins can report a payment.");
  // No part payments: always the invoice's full amount due.
  const invoice = mine?.invoices?.find((i) => i.id === v.invoiceId);
  if (!invoice) return fail("That invoice isn't open.");

  const admin = createAdminClient();
  const proof = await uploadProof(admin, tenantId, form.get("proof") as File | null);
  if ("error" in proof) return fail(proof.error!);

  const { error } = await supabase.rpc("submit_subscription_payment", {
    p_invoice_id: v.invoiceId,
    p_amount: Number(invoice.total) - Number(invoice.amountPaid),
    p_paid_on: v.paidOn,
    p_method: v.method,
    p_reference: v.reference,
    p_payer_name: v.payerName,
    p_note: v.note,
    p_proof_path: proof.path as string,
  });
  if (error) {
    if (proof.path) await admin.storage.from("subscription-proofs").remove([proof.path]);
    // The function's own messages (amount, date, invoice not open...) are written for the admin.
    if (error.code === "22023" || error.code === "42501") return fail(error.message);
    console.error("submit_subscription_payment failed:", error);
    return fail("We couldn't send it. Please try again.");
  }
  await deliverSubscriptionEvents({ tenantId });
  refresh();
  return { status: "success", message: "Thank you. We'll check it and email you a receipt once it's confirmed." };
}

/** "Request a plan change": emails the superadmins (once a day per organization). */
export async function requestPlanChange(message: string): Promise<MySubscriptionResult> {
  const { role, tenant, fullName, email } = await getShopSession();
  if (role !== "admin") return fail("Only admins can ask for a plan change.");
  const body = z.string().trim().min(5, "Say what you need, e.g. more users or another store.").max(800).safeParse(message);
  if (!body.success) return fail(body.error.issues[0]?.message ?? "Say what you need.");
  const admin = createAdminClient();
  const { error } = await admin.from("subscription_events").insert({
    tenant_id: tenant.id,
    kind: "plan_change_requested",
    message: `${fullName} (${email}): ${body.data}`,
  });
  if (error) {
    if (error.code === "23505") return fail("You've already sent a request today. We'll be in touch.");
    console.error("plan change request failed:", error);
    return fail("We couldn't send it. Please try again.");
  }
  await deliverSubscriptionEvents({ tenantId: tenant.id });
  return { status: "success", message: "Sent. ProductLogik will contact you about the change." };
}
