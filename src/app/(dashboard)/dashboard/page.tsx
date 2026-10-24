import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { BarChart3, CheckCircle2, FilePlus2, ReceiptText, Settings, Store } from "lucide-react";
import { getShopSession } from "@/lib/auth";
import { DashboardMetrics, DashboardMetricsSkeleton } from "@/components/dashboard/dashboard-metrics";
import { GetStartedCard } from "@/components/dashboard/get-started-card";
import { ShopClock } from "@/components/dashboard/shop-clock";
import type { OnboardingProgress } from "@/lib/onboarding";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Overview" };

async function Greeting() {
  const session = await getShopSession();
  const { tenant } = session;
  const firstName = session.fullName.split(" ")[0];
  return (
    <div className="page-heading overview-heading">
      <div className="overview-greeting">
        {/* Settings → Localization → Overview page turns the logo on/off; nothing shows without one. */}
        {tenant.showOverviewLogo && tenant.logoUrl && (
          <span className="overview-logo">
            {/* eslint-disable-next-line @next/next/no-img-element -- shop logo from Supabase Storage */}
            <img src={tenant.logoUrl} alt={`${tenant.name} logo`} />
          </span>
        )}
        <div>
          <span className="eyebrow">STORE OVERVIEW</span>
          <h1>Welcome, {firstName}</h1>
          <p>Here&apos;s what&apos;s happening across {session.tenant.name}.</p>
        </div>
      </div>
      {/* Settings → Localization → Overview page turns this on/off and picks the design. */}
      {tenant.showClock && <ShopClock timeZone={tenant.timezone} clockStyle={tenant.clockStyle} hour24={tenant.clock24Hour} />}
    </div>
  );
}

/** RF-18.3: org admins only, until every step is done or the card is dismissed. */
async function GetStarted() {
  const { role } = await getShopSession();
  if (role !== "admin") return null;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("my_onboarding");
  if (error) {
    console.error("my_onboarding failed:", error.message);
    return null;
  }
  const progress = data as unknown as OnboardingProgress;
  if (progress.dismissed || !progress.steps.length || progress.steps.every((s) => s.done)) return null;
  return <GetStartedCard steps={progress.steps} />;
}

async function ShopReadyCard() {
  const { tenant, role, email } = await getShopSession();
  const rows = [
    { label: "Shop name", value: tenant.name },
    { label: "Shop handle", value: tenant.slug, mono: true },
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

const quickActions = [
  { href: "/invoices/new", icon: ReceiptText, title: "New invoice", detail: "Bill a customer; stock is deducted when you save." },
  { href: "/quotations/new", icon: FilePlus2, title: "New quotation", detail: "Price a job; share it as a PDF or on WhatsApp." },
  { href: "/reports", icon: BarChart3, title: "Reports", detail: "Sales, profit, payments, money owed and stock." },
  { href: "/settings", icon: Settings, title: "Shop details & logo", detail: "What your quotations and invoices show." },
];

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default function DashboardPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <div className="page">
      <Suspense fallback={<div className="page-heading"><div><span className="eyebrow">STORE OVERVIEW</span><h1>Welcome</h1></div></div>}>
        <Greeting />
      </Suspense>
      <Suspense fallback={null}>
        <GetStarted />
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
              <h2>Quick actions</h2>
              <p>Jump straight to common tasks.</p>
            </div>
          </div>
          <div className="restock-list">
            {quickActions.map(({ href, icon: Icon, title, detail }) => (
              <Link className="restock-item quick-action" href={href} key={title}>
                <div className="header-with-icon">
                  <span className="header-icon blue"><Icon size={16} /></span>
                  <div className="primary-cell">
                    <strong>{title}</strong>
                    <span>{detail}</span>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
