import "server-only";
import { sendTransactionalEmail, type EmailTemplate } from "@/lib/email/send";
import { subscriptionNotice, subscriptionPaymentEmail, superadminSubscriptionNotice } from "@/lib/email/templates/subscription";
import type { EmailContent } from "@/lib/email/templates/layout";
import { getPlatformBilling } from "@/lib/platform-billing";
import { addDays, billingDate, methodLabel, pkr } from "@/lib/subscription";
import { createAdminClient } from "@/lib/supabase/admin";

// Subscription emails (Phase 17, deliverable 9). The database queues an event for each thing to
// tell (subscription_events: issued, reminder, overdue, payment...); this sends the unsent ones once.
// Called after each console action, after "I've paid", and by the daily cron route.

type Admin = ReturnType<typeof createAdminClient>;

/** Events older than this are marked expired instead of sent (e.g. after a long outage). */
const MAX_AGE_DAYS = 7;

const appOrigin = (origin?: string | null) => origin ?? process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

/** The organization's owner admin, else its first active admin. */
async function ownerOf(admin: Admin, tenantId: string) {
  const { data: tenant } = await admin.from("tenants").select("name, owner_id").eq("id", tenantId).maybeSingle();
  const { data: admins } = await admin
    .from("profiles")
    .select("id, full_name, email")
    .eq("tenant_id", tenantId)
    .eq("role", "admin")
    .is("deactivated_at", null)
    .order("created_at");
  const owner = admins?.find((a) => a.id === tenant?.owner_id) ?? admins?.[0];
  return { tenantName: tenant?.name ?? "Your organization", owner: owner ?? null };
}

const invoiceOf = (i: {
  number: string;
  plan_name: string;
  period_start: string;
  period_end: string;
  due_date: string;
  total: number | string;
  amount_paid: number | string;
}) => ({
  number: i.number,
  planName: i.plan_name,
  periodStart: i.period_start,
  periodEnd: i.period_end,
  dueDate: i.due_date,
  total: Number(i.total),
  amountPaid: Number(i.amount_paid),
});

/** Sends every unsent subscription event (oldest first, at most `limit`). Returns how many were sent. */
export async function deliverSubscriptionEvents(options: { origin?: string | null; tenantId?: string; limit?: number } = {}) {
  const admin = createAdminClient();
  const origin = appOrigin(options.origin);
  let query = admin
    .from("subscription_events")
    .select("*, subscription_invoices(*), subscription_payments(*)")
    .is("sent_at", null)
    .order("created_at")
    .limit(options.limit ?? 50);
  if (options.tenantId) query = query.eq("tenant_id", options.tenantId);
  const { data: events, error } = await query;
  if (error) {
    console.error("subscription_events read failed:", error);
    return 0;
  }
  if (!events?.length) return 0;

  const { payTo: to } = await getPlatformBilling();
  const cutoff = Date.now() - MAX_AGE_DAYS * 86_400_000;
  let sent = 0;

  for (const e of events) {
    // Claim it first, so two runs at once can't both send it.
    const { data: claimed } = await admin
      .from("subscription_events")
      .update({ sent_at: new Date().toISOString(), email_status: "sending" })
      .eq("id", e.id)
      .is("sent_at", null)
      .select("id");
    if (!claimed?.length) continue;
    const mark = (email_status: string) => admin.from("subscription_events").update({ email_status }).eq("id", e.id);
    if (Date.parse(e.created_at) < cutoff) {
      await mark("expired");
      continue;
    }

    const { tenantName, owner } = await ownerOf(admin, e.tenant_id);
    const invoice = e.subscription_invoices ? invoiceOf(e.subscription_invoices) : null;
    const payment = e.subscription_payments;
    const subscriptionUrl = `${origin}/settings/subscription`;

    // Platform notices go to every superadmin.
    if (e.kind === "payment_submitted" || e.kind === "plan_change_requested") {
      const { data: supers } = await admin.from("platform_admins").select("email").is("removed_at", null);
      const rows: [string, string][] =
        e.kind === "payment_submitted" && payment && invoice
          ? [
              ["Invoice", invoice.number],
              ["Amount", pkr(Number(payment.amount))],
              ["Method", methodLabel(payment.method)],
              ["Reference", payment.reference ?? "—"],
              ["Paid on", billingDate(payment.paid_on)],
            ]
          : [["Organization", tenantName]];
      const content = superadminSubscriptionNotice({
        kind: e.kind,
        tenantName,
        rows,
        message: e.message,
        url: e.kind === "payment_submitted" ? `${origin}/admin/billing` : `${origin}/admin/tenants/${e.tenant_id}/subscription`,
      });
      let ok = false;
      for (const s of supers ?? []) {
        const r = await sendTransactionalEmail({ template: "superadmin_notice", to: s.email, content, tenantId: null, sentBy: null, metadata: { eventId: e.id } });
        ok ||= r.status !== "failed";
      }
      await mark(ok ? "sent" : "failed");
      if (ok) sent++;
      continue;
    }

    if (!owner) {
      await mark("no_recipient");
      continue;
    }

    let template: EmailTemplate = "subscription_notice";
    let content: EmailContent | null = null;
    switch (e.kind) {
      case "invoice_issued":
      case "reminder":
      case "overdue":
      case "suspended":
      case "reactivated":
      case "ended": {
        let graceEnds: string | null = null;
        if (e.kind === "overdue") {
          const { data: s } = await admin.from("tenant_subscriptions").select("next_due_date, grace_days, auto_suspend").eq("tenant_id", e.tenant_id).maybeSingle();
          if (s?.next_due_date && s.auto_suspend) graceEnds = addDays(s.next_due_date, s.grace_days);
        }
        template = e.kind === "invoice_issued" ? "subscription_invoice" : e.kind === "reminder" ? "subscription_reminder" : "subscription_notice";
        content = subscriptionNotice({
          kind: e.kind,
          fullName: owner.full_name,
          tenantName,
          invoice,
          days: e.days,
          graceEnds,
          payTo: to,
          subscriptionUrl,
        });
        break;
      }
      case "payment_verified":
      case "payment_rejected":
        if (payment && invoice) {
          template = e.kind === "payment_verified" ? "subscription_receipt" : "subscription_notice";
          content = subscriptionPaymentEmail({
            kind: e.kind === "payment_verified" ? "verified" : "rejected",
            fullName: owner.full_name,
            tenantName,
            payment: { amount: Number(payment.amount), paidOn: payment.paid_on, method: payment.method, reference: payment.reference, reason: payment.reason },
            invoice,
            subscriptionUrl,
          });
        }
        break;
    }
    if (!content) {
      await mark("skipped");
      continue;
    }
    const result = await sendTransactionalEmail({
      template,
      to: owner.email,
      content,
      tenantId: e.tenant_id,
      sentBy: null,
      metadata: { eventId: e.id, kind: e.kind },
    });
    await mark(result.status);
    if (result.status !== "failed") sent++;
    if (e.kind === "invoice_issued" && e.invoice_id && result.status !== "failed") {
      await admin.from("subscription_invoices").update({ emailed_at: new Date().toISOString() }).eq("id", e.invoice_id);
    }
  }
  return sent;
}
