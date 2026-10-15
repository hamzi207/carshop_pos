import { Suspense } from "react";
import type { Metadata } from "next";
import { BarChart3, CheckCircle2, FileDown, MessageCircle, Store } from "lucide-react";
import { getShopSession } from "@/lib/auth";
import { DashboardMetrics, DashboardMetricsSkeleton } from "@/components/dashboard/dashboard-metrics";
import { ShopClock } from "@/components/dashboard/shop-clock";

export const metadata: Metadata = { title: "Overview" };

async function Greeting() {
  const session = await getShopSession();
  const { tenant } = session;
  const firstName = session.fullName.split(" ")[0];
  return (
    <div className="page-heading overview-heading">
      <div>
        <span className="eyebrow">STORE OVERVIEW</span>
        <h1>Welcome, {firstName}</h1>
        <p>Here&apos;s what&apos;s happening across {session.tenant.name}.</p>
      </div>
      {/* Settings → Dashboard clock turns this on/off and picks the design. */}
      {tenant.showClock && <ShopClock timeZone={tenant.timezone} clockStyle={tenant.clockStyle} hour24={tenant.clock24Hour} />}
    </div>
  );
}

async function ShopReadyCard() {
  const { tenant, role, email } = await getShopSession();
  const rows = [
    { label: "Shop name", value: tenant.name },
    { label: "Shop ID", value: tenant.id, mono: true },
    { label: "Your role", value: role === "admin" ? "Admin" : "Staff" },
    { label: "Signed in as", value: email },
    { label: "Currency", value: tenant.currency },
    { label: "Tax rate", value: `${tenant.taxRate.toFixed(2)}%` },
  ];

  return (
    <section className="card">
      <div className="card-header">
        <div className="header-with-icon">
          <span className="header-icon blue"><Store size={18} /></span>
          <div>
            <h2>Your shop workspace is ready</h2>
            <p>Shop and admin profile created and secured with row-level security.</p>
          </div>
        </div>
        <span className="badge badge-green"><CheckCircle2 size={12} /> Active</span>
      </div>
      <div className="table-wrap">
        <table>
          <tbody>
            {rows.map((row) => (
              <tr key={row.label}>
                <td style={{ width: 180, color: "var(--slate-500)" }}>{row.label}</td>
                <td className={row.mono ? "mono" : "amount"}>{row.value}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

const nextSteps = [
  { icon: FileDown, title: "PDF quotes & invoices", detail: "Branded PDFs with your shop details and terms." },
  { icon: MessageCircle, title: "Share via WhatsApp", detail: "Send a quote or invoice link in one click." },
  { icon: BarChart3, title: "Reports", detail: "Sales, profit and stock reports for any period." },
];

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default function DashboardPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <div className="page">
      <Suspense fallback={<div className="page-heading"><div><span className="eyebrow">STORE OVERVIEW</span><h1>Welcome</h1></div></div>}>
        <Greeting />
      </Suspense>
      <Suspense fallback={<DashboardMetricsSkeleton />}>
        <DashboardMetrics searchParams={searchParams} />
      </Suspense>
      <div className="dashboard-grid">
        <Suspense fallback={<section className="card"><div className="empty-state">Loading your shop…</div></section>}>
          <ShopReadyCard />
        </Suspense>
        <section className="card">
          <div className="card-header">
            <div>
              <h2>Coming next</h2>
              <p>These unlock as the build progresses.</p>
            </div>
          </div>
          <div className="restock-list">
            {nextSteps.map(({ icon: Icon, title, detail }) => (
              <div className="restock-item" key={title}>
                <div className="header-with-icon">
                  <span className="header-icon blue"><Icon size={16} /></span>
                  <div className="primary-cell">
                    <strong>{title}</strong>
                    <span>{detail}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
