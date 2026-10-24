import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { Activity, FileText, Receipt, Store, Users } from "lucide-react";
import { ActivityList } from "@/components/admin/activity-list";
import { adminDate, adminMoney, statusBadge } from "@/components/admin/format";
import { SignupsChart } from "@/components/admin/signups-chart";
import { Stat } from "@/components/admin/stat";
import { NeedsAttention } from "@/components/admin/needs-attention";
import { getAttention, getNewestShops, getPlatformMetrics, getRecentActivity } from "@/lib/admin-data";

export const metadata: Metadata = { title: "Overview" };

async function Overview() {
  const [m, activity, newest, attention] = await Promise.all([getPlatformMetrics(), getRecentActivity(12), getNewestShops(5), getAttention()]);
  const [main, ...others] = m.sales;
  const count = (n: number) => n.toLocaleString("en-PK");
  return (
    <>
      <div className="stat-grid admin-stats">
        <Stat
          tone="blue"
          icon={<Store size={16} />}
          title="Organizations"
          value={count(m.shops.total)}
          detail={`${m.shops.active} active · ${m.shops.trial} trial · ${m.shops.suspended} suspended · ${m.shops.newThisMonth} new this month`}
        />
        <Stat tone="green" icon={<Users size={16} />} title="Active users" value={count(m.users.active30)} detail={`signed in within 30 days, of ${count(m.users.total)} users`} />
        <Stat
          tone="purple"
          icon={<Receipt size={16} />}
          title="Platform sales (GMV)"
          value={main ? adminMoney(main.total, main.currency) : "—"}
          detail={
            main
              ? `${count(main.invoices)} invoices · ${adminMoney(main.thisMonth ?? 0, main.currency)} this month · ${adminMoney(main.collected, main.currency)} collected` +
                (others.length ? ` · plus ${others.map((o) => adminMoney(o.total, o.currency)).join(", ")}` : "")
              : "No invoices yet"
          }
        />
        <Stat
          tone="amber"
          icon={<FileText size={16} />}
          title="Open quotations"
          value={count(m.documents.quotations)}
          detail={`worth ${main ? adminMoney(m.documents.quotationsValue, main.currency) : m.documents.quotationsValue} · ${count(m.documents.drafts)} drafts`}
        />
      </div>
      <NeedsAttention data={attention} today={attention.today} />
      <div className="admin-grid">
        <section className="card">
          <div className="card-header">
            <div>
              <h2>New organizations</h2>
              <p>New shops per month, last 12 months</p>
            </div>
          </div>
          <div className="admin-card-body">
            <SignupsChart signups={m.signups} />
          </div>
        </section>
        <section className="card">
          <div className="card-header">
            <div>
              <h2>Newest shops</h2>
              <p>Most recent first</p>
            </div>
            <Link href="/admin/tenants" className="detail-link">All shops</Link>
          </div>
          <ul className="admin-list">
            {newest.map((t) => {
              const badge = statusBadge(t.status);
              return (
                <li key={t.id}>
                  <Link href={`/admin/tenants/${t.id}`} className="detail-link">{t.name}</Link>
                  <span className={badge.tone}>{badge.label}</span>
                  <span className="admin-muted">{adminDate(t.created_at)}</span>
                </li>
              );
            })}
          </ul>
        </section>
      </div>
      <section className="card">
        <div className="card-header">
          <div>
            <h2><Activity size={14} /> Recent superadmin activity</h2>
            <p>From the audit log</p>
          </div>
        </div>
        <ActivityList entries={activity} showShop />
      </section>
    </>
  );
}

export default function AdminOverviewPage() {
  return (
    <div className="page">
      <div className="page-heading">
        <div>
          <span className="eyebrow">PLATFORM</span>
          <h1>Overview</h1>
          <p>Every organization on ProductLogik Invoicing System at a glance.</p>
        </div>
      </div>
      <Suspense fallback={<section className="card"><div className="empty-state">Loading platform figures…</div></section>}>
        <Overview />
      </Suspense>
    </div>
  );
}
