import type { NextRequest } from "next/server";
import { toCsv } from "@/lib/csv";
import { getSuperadminSession } from "@/lib/superadmin";
import { createAdminClient } from "@/lib/supabase/admin";
import { billingToday } from "@/lib/subscription";

/** /admin/billing CSV export (Phase 17, deliverable 9): ?kind=invoices or ?kind=payments, every organization. */
export async function GET(request: NextRequest) {
  const session = await getSuperadminSession();
  if (!session?.aal2) return new Response("Not found", { status: 404 });
  const kind = request.nextUrl.searchParams.get("kind") === "payments" ? "payments" : "invoices";
  const admin = createAdminClient();

  let csv: string;
  if (kind === "invoices") {
    const { data } = await admin
      .from("subscription_invoices")
      .select("number, issue_date, due_date, period_start, period_end, plan_name, billing_cycle, subtotal, discount, adjustments, total, amount_paid, status, void_reason, tenants(name)")
      .order("issue_date", { ascending: false })
      .limit(10000);
    csv = toCsv(
      ["Invoice", "Organization", "Issued", "Due", "Period from", "Period to", "Plan", "Cycle", "Subtotal", "Discount", "Adjustments", "Total", "Paid", "Status", "Void reason"],
      (data ?? []).map((i) => [
        i.number, i.tenants?.name ?? "", i.issue_date, i.due_date, i.period_start, i.period_end, i.plan_name, i.billing_cycle,
        Number(i.subtotal), Number(i.discount), Number(i.adjustments), Number(i.total), Number(i.amount_paid), i.status, i.void_reason,
      ]),
    );
  } else {
    const { data } = await admin
      .from("subscription_payments")
      .select("paid_on, amount, method, reference, payer_name, status, reason, created_at, verified_at, tenants(name), subscription_invoices(number)")
      .order("paid_on", { ascending: false })
      .limit(10000);
    csv = toCsv(
      ["Paid on", "Organization", "Invoice", "Amount", "Method", "Reference", "Sender", "Status", "Reason", "Reported / recorded", "Verified"],
      (data ?? []).map((p) => [
        p.paid_on, p.tenants?.name ?? "", p.subscription_invoices?.number ?? "", Number(p.amount), p.method, p.reference, p.payer_name,
        p.status, p.reason, p.created_at, p.verified_at,
      ]),
    );
  }
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="subscription-${kind}-${billingToday()}.csv"`,
      "Cache-Control": "private, no-store",
    },
  });
}
