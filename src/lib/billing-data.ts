import "server-only";
import { requireSuperadmin } from "@/lib/superadmin";
import { createAdminClient } from "@/lib/supabase/admin";
import { addDays, billingToday, type BillingCycle, type SubscriptionStatus } from "@/lib/subscription";

// /admin/billing (Phase 17, deliverable 9): who is due, past due or suspended, payments to verify,
// and what's collected and expected.

export type BillingRow = {
  tenantId: string;
  tenantName: string;
  planName: string;
  cycle: BillingCycle;
  status: SubscriptionStatus;
  /** Due date, trial end or suspension date, depending on the list. */
  date: string | null;
  /** Open balance on its invoices. */
  owed: number;
};

export type PendingPayment = {
  id: string;
  tenantId: string;
  tenantName: string;
  invoiceNumber: string;
  amount: number;
  paidOn: string;
  method: string;
  reference: string | null;
  payerName: string | null;
  hasProof: boolean;
  createdAt: string;
};

export type BillingOverview = {
  today: string;
  dueThisWeek: BillingRow[];
  pastDue: BillingRow[];
  suspended: BillingRow[];
  trialsEnding: BillingRow[];
  pending: PendingPayment[];
  collected: { thisMonth: number; lastMonth: number };
  /** Expected monthly revenue from paying subscriptions (yearly ÷ 12). */
  mrr: number;
  perPlan: { plan: string; organizations: number; mrr: number }[];
};

const monthStart = (date: string, back = 0) => {
  const d = new Date(`${date.slice(0, 7)}-01T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() - back);
  return d.toISOString().slice(0, 10);
};

export async function getBillingOverview(): Promise<BillingOverview> {
  await requireSuperadmin();
  const admin = createAdminClient();
  const today = billingToday();
  const [{ data: subs, error }, { data: open }, { data: pending }, { data: paid }] = await Promise.all([
    admin
      .from("tenant_subscriptions")
      .select("tenant_id, billing_cycle, status, agreed_price, discount_type, discount_value, trial_ends_at, next_due_date, updated_at, cancel_at, tenants!inner(name, archived_at, status_reason), plan:subscription_plans!tenant_subscriptions_plan_id_fkey(name, price_monthly, price_yearly)")
      .is("tenants.archived_at", null),
    admin.from("subscription_invoices").select("tenant_id, total, amount_paid").in("status", ["unpaid", "partly_paid"]),
    admin
      .from("subscription_payments")
      .select("id, tenant_id, amount, paid_on, method, reference, payer_name, proof_path, created_at, tenants(name), subscription_invoices(number)")
      .eq("status", "pending")
      .order("created_at"),
    admin.from("subscription_payments").select("amount, paid_on").eq("status", "verified").gte("paid_on", monthStart(today, 1)),
  ]);
  if (error) throw new Error(`tenant_subscriptions: ${error.message}`);

  const owed = new Map<string, number>();
  for (const i of open ?? []) owed.set(i.tenant_id, (owed.get(i.tenant_id) ?? 0) + Number(i.total) - Number(i.amount_paid));

  const weekEnd = addDays(today, 7);
  const lists = { dueThisWeek: [] as BillingRow[], pastDue: [] as BillingRow[], suspended: [] as BillingRow[], trialsEnding: [] as BillingRow[] };
  const perPlan = new Map<string, { organizations: number; mrr: number }>();
  let mrr = 0;

  for (const s of subs ?? []) {
    const cycle: BillingCycle = s.billing_cycle === "yearly" ? "yearly" : "monthly";
    const row = (date: string | null): BillingRow => ({
      tenantId: s.tenant_id,
      tenantName: s.tenants.name,
      planName: s.plan?.name ?? "",
      cycle,
      status: s.status as SubscriptionStatus,
      date,
      owed: owed.get(s.tenant_id) ?? 0,
    });
    if (s.status === "past_due") lists.pastDue.push(row(s.next_due_date));
    else if (s.status === "suspended") lists.suspended.push(row(s.updated_at.slice(0, 10)));
    else if (s.status === "trial" && s.trial_ends_at && s.trial_ends_at <= weekEnd) lists.trialsEnding.push(row(s.trial_ends_at));
    else if (s.status === "active" && s.next_due_date && s.next_due_date >= today && s.next_due_date <= weekEnd && (owed.get(s.tenant_id) ?? 0) > 0) {
      lists.dueThisWeek.push(row(s.next_due_date));
    }

    // Expected revenue: paying subscriptions that aren't ending.
    if ((s.status === "active" || s.status === "past_due") && !s.cancel_at) {
      const planPrice = cycle === "yearly" ? s.plan?.price_yearly : s.plan?.price_monthly;
      const base = Number(s.agreed_price ?? planPrice ?? 0);
      const value = Number(s.discount_value);
      const discount = Math.min(base, s.discount_type === "amount" ? value : s.discount_type === "percent" ? (base * value) / 100 : 0);
      const monthly = (base - discount) / (cycle === "yearly" ? 12 : 1);
      if (monthly > 0) {
        mrr += monthly;
        const name = s.plan?.name ?? "Unknown";
        const p = perPlan.get(name) ?? { organizations: 0, mrr: 0 };
        perPlan.set(name, { organizations: p.organizations + 1, mrr: p.mrr + monthly });
      }
    }
  }

  const byDate = (a: BillingRow, b: BillingRow) => (a.date ?? "").localeCompare(b.date ?? "");
  const thisMonth = monthStart(today);
  return {
    today,
    dueThisWeek: lists.dueThisWeek.sort(byDate),
    pastDue: lists.pastDue.sort(byDate),
    suspended: lists.suspended.sort(byDate),
    trialsEnding: lists.trialsEnding.sort(byDate),
    pending: (pending ?? []).map((p) => ({
      id: p.id,
      tenantId: p.tenant_id,
      tenantName: p.tenants?.name ?? "",
      invoiceNumber: p.subscription_invoices?.number ?? "",
      amount: Number(p.amount),
      paidOn: p.paid_on,
      method: p.method,
      reference: p.reference,
      payerName: p.payer_name,
      hasProof: Boolean(p.proof_path),
      createdAt: p.created_at,
    })),
    collected: {
      thisMonth: (paid ?? []).filter((p) => p.paid_on >= thisMonth).reduce((sum, p) => sum + Number(p.amount), 0),
      lastMonth: (paid ?? []).filter((p) => p.paid_on < thisMonth).reduce((sum, p) => sum + Number(p.amount), 0),
    },
    mrr: Math.round(mrr),
    perPlan: [...perPlan.entries()].map(([plan, v]) => ({ plan, organizations: v.organizations, mrr: Math.round(v.mrr) })).sort((a, b) => b.mrr - a.mrr),
  };
}
