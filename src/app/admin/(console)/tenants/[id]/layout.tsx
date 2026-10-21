import { Suspense, type ReactNode } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { adminDate, adminMoney, statusBadge } from "@/components/admin/format";
import { TenantActions } from "@/components/admin/tenant-actions";
import { TenantTabList, TenantTabs } from "@/components/admin/tenant-tabs";
import { getTenantDetail } from "@/lib/admin-data";
import { tenantParam } from "@/lib/admin-params";

type Params = Promise<{ id: string }>;

async function TenantHeader({ params }: { params: Params }) {
  const id = await tenantParam(params);
  const detail = await getTenantDetail(id);
  if (!detail) notFound();
  const { tenant, members, totals } = detail;
  const badge = statusBadge(tenant.status);
  return (
    <>
      <div className="page-heading">
        <div>
          <Link href="/admin/tenants" className="admin-crumb"><ArrowLeft size={13} /> Shops</Link>
          <div className="quote-title-line">
            <h1>{tenant.name}</h1>
            {tenant.archived_at ? <span className="badge badge-amber">Archived</span> : <span className={badge.tone}>{badge.label}</span>}
          </div>
          <p>
            {members.length} {members.length === 1 ? "user" : "users"} · {totals.invoices} invoices ·{" "}
            {adminMoney(totals.sales, tenant.currency)} sales · last sign-in {adminDate(totals.lastSignInAt)} · created {adminDate(tenant.created_at)}
          </p>
        </div>
        <div className="heading-actions">
          <TenantActions tenantId={tenant.id} name={tenant.name} status={tenant.status} archived={tenant.archived_at !== null} showEdit={false} />
        </div>
      </div>
      {/* usePathname() is request data: the highlighted tab streams in after the header. */}
      <Suspense fallback={<TenantTabList tenantId={tenant.id} pathname={null} />}>
        <TenantTabs tenantId={tenant.id} />
      </Suspense>
    </>
  );
}

/** /admin/tenants/[id]: the organization's header and tabs (Phase 17, deliverable 3); each tab is a route. */
export default function TenantLayout({ children, params }: { children: ReactNode; params: Params }) {
  return (
    <div className="page settings-page">
      <Suspense fallback={<section className="card"><div className="empty-state">Loading shop…</div></section>}>
        <TenantHeader params={params} />
      </Suspense>
      {children}
    </div>
  );
}
