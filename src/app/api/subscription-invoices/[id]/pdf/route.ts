import type { NextRequest } from "next/server";
import type { SubscriptionInvoicePdfData } from "@/components/pdf/subscription-invoice-pdf";
import { subscriptionInvoiceResponse } from "@/lib/pdf";
import { getPlatformBilling } from "@/lib/platform-billing";
import { getSuperadminSession } from "@/lib/superadmin";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Party = SubscriptionInvoicePdfData["buyer"];
type InvoiceRow = {
  number: string;
  plan_name: string;
  billing_cycle: string;
  period_start: string;
  period_end: string;
  issue_date: string;
  due_date: string;
  total: number | string;
  amount_paid: number | string;
  status: string;
};

/** The invoice, its lines and the organization: any invoice for a superadmin, else the caller's own organization's (its admins). */
async function load(id: string) {
  const session = await getSuperadminSession();
  if (session?.aal2) {
    const { data } = await createAdminClient()
      .from("subscription_invoices")
      .select("*, subscription_invoice_lines(kind, description, amount, sort_order), tenants(name, address, phone, email, ntn)")
      .eq("id", id)
      .maybeSingle();
    if (!data?.tenants) return null;
    const lines = [...data.subscription_invoice_lines].sort((a, b) => a.sort_order - b.sort_order);
    return { invoice: data as InvoiceRow, lines, tenant: data.tenants as Party };
  }
  const { data } = await (await createClient()).rpc("my_subscription_invoice", { p_invoice: id });
  if (!data) return null;
  const d = data as { invoice: InvoiceRow; lines: { kind: string; description: string; amount: number }[]; tenant: Party };
  return { invoice: d.invoice, lines: d.lines, tenant: d.tenant };
}

/** A subscription invoice PDF (Phase 17, deliverable 9). ?download=1 saves it. */
export async function GET(request: NextRequest, ctx: RouteContext<"/api/subscription-invoices/[id]/pdf">) {
  const { id } = await ctx.params;
  if (!UUID.test(id)) return new Response("Not found", { status: 404 });
  const found = await load(id);
  if (!found) return new Response("Not found", { status: 404 });
  const { seller, payTo } = await getPlatformBilling();
  const i = found.invoice;
  return subscriptionInvoiceResponse(
    {
      seller,
      buyer: found.tenant,
      invoice: {
        number: i.number,
        planName: i.plan_name,
        cycle: i.billing_cycle === "yearly" ? "yearly" : "monthly",
        periodStart: i.period_start,
        periodEnd: i.period_end,
        issueDate: i.issue_date,
        dueDate: i.due_date,
        total: Number(i.total),
        amountPaid: Number(i.amount_paid),
        status: i.status,
      },
      lines: found.lines.map((l) => ({ kind: l.kind, description: l.description, amount: Number(l.amount) })),
      payTo,
    },
    request.nextUrl.searchParams.has("download"),
  );
}
