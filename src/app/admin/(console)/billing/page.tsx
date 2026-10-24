import { Suspense } from "react";
import type { Metadata } from "next";
import { Banknote, CalendarClock, TrendingUp, Wallet } from "lucide-react";
import { BillingOverviewPanel } from "@/components/admin/billing-overview";
import { Stat } from "@/components/admin/stat";
import { SectionTabs } from "@/components/admin/section-tabs";
import { getBillingOverview } from "@/lib/billing-data";
import { pkr } from "@/lib/subscription";

export const metadata: Metadata = { title: "Billing" };

async function Billing() {
  const data = await getBillingOverview();
  const owed = [...data.pastDue, ...data.suspended].reduce((sum, r) => sum + r.owed, 0);
  return (
    <>
      <div className="stat-grid admin-stats">
        <Stat tone="green" icon={<Wallet size={16} />} title="Collected this month" value={pkr(data.collected.thisMonth)} detail={`${pkr(data.collected.lastMonth)} last month`} />
        <Stat tone="blue" icon={<TrendingUp size={16} />} title="Expected per month" value={pkr(data.mrr)} detail="From active paying subscriptions" />
        <Stat tone="amber" icon={<Banknote size={16} />} title="Payments to verify" value={String(data.pending.length)} detail={data.pending.length ? `${pkr(data.pending.reduce((s, p) => s + p.amount, 0))} reported` : "Nothing waiting"} />
        <Stat tone="purple" icon={<CalendarClock size={16} />} title="Overdue" value={pkr(owed)} detail={`${data.pastDue.length} past due · ${data.suspended.length} suspended`} />
      </div>
      <BillingOverviewPanel data={data} />
    </>
  );
}

/** Subscription billing across organizations (Phase 17, deliverable 9). */
export default function BillingPage() {
  return (
    <div className="page">
      <div className="page-heading">
        <div>
          <span className="eyebrow">BILLING</span>
          <h1>Billing</h1>
          <p>Who owes what, payments to verify, and what&apos;s collected. Payments are by mobile wallet or bank transfer.</p>
        </div>
      </div>
      <SectionTabs section="billing" />
      <Suspense fallback={<section className="card"><div className="empty-state">Loading billing…</div></section>}>
        <Billing />
      </Suspense>
    </div>
  );
}
