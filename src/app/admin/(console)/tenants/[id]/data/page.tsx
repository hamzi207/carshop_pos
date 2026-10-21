import { Suspense } from "react";
import type { Metadata } from "next";
import { CheckCircle2, Download, Stethoscope, TriangleAlert } from "lucide-react";
import { adminDateTime } from "@/components/admin/format";
import { tenantParam } from "@/lib/admin-params";
import { requireSuperadmin } from "@/lib/superadmin";
import { createAdminClient } from "@/lib/supabase/admin";

export const metadata: Metadata = { title: "Shop · Data" };

type Params = Promise<{ id: string }>;

type Reconcile = {
  payments: { id: string; number: string | null; stored: number; computed: number }[];
  reservations: { id: string; sku: string; name: string; stored: number; computed: number }[];
  checkedAt: string;
};

async function HealthChecks({ params }: { params: Params }) {
  const id = await tenantParam(params);
  await requireSuperadmin();
  const { data, error } = await createAdminClient().rpc("admin_reconcile_tenant", { p_tenant: id });
  if (error) throw new Error(`admin_reconcile_tenant: ${error.message}`);
  const r = data as unknown as Reconcile;
  const clean = r.payments.length === 0 && r.reservations.length === 0;
  return (
    <section className="card settings-card">
      <div className="settings-card-head">
        <span className="header-icon blue"><Stethoscope size={18} /></span>
        <div>
          <h2>Health checks</h2>
          <p>Stored figures compared with what the records add up to. Checked {adminDateTime(r.checkedAt)}; reload the page to check again.</p>
        </div>
      </div>
      {clean ? (
        <p className="data-check-ok"><CheckCircle2 size={15} /> Everything adds up: invoice payments and stock reservations match their records.</p>
      ) : (
        <div className="data-checks">
          {r.payments.length > 0 && (
            <div>
              <h3><TriangleAlert size={14} /> Invoices whose amount paid isn&apos;t the sum of their payments ({r.payments.length})</h3>
              <table className="admin-table">
                <thead><tr><th>INVOICE</th><th>STORED</th><th>FROM PAYMENTS</th></tr></thead>
                <tbody>
                  {r.payments.map((p) => (
                    <tr key={p.id}><td className="mono">{p.number ?? p.id}</td><td className="amount">{p.stored}</td><td className="amount">{p.computed}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {r.reservations.length > 0 && (
            <div>
              <h3><TriangleAlert size={14} /> Items whose reserved quantity doesn&apos;t match open quotations ({r.reservations.length})</h3>
              <table className="admin-table">
                <thead><tr><th>ITEM</th><th>STORED</th><th>FROM QUOTATIONS</th></tr></thead>
                <tbody>
                  {r.reservations.map((i) => (
                    <tr key={i.id}><td><span className="mono">{i.sku}</span> {i.name}</td><td className="amount">{i.stored}</td><td className="amount">{i.computed}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

async function Export({ params }: { params: Params }) {
  const id = await tenantParam(params);
  return (
    <section className="card settings-card">
      <div className="settings-card-head">
        <span className="header-icon blue"><Download size={18} /></span>
        <div>
          <h2>Full export</h2>
          <p>
            A ZIP with a CSV and a JSON file for every table of this organization (team, products, customers, documents, payments,
            emails, subscription) plus its logo and payment proofs. Works for archived organizations too. Audited.
          </p>
        </div>
        <a className="button button-primary" href={`/api/admin/tenants/${id}/export`} download><Download size={14} /> Download ZIP</a>
      </div>
      <p className="data-note">To import products for them, use Login As and Inventory → Import CSV: the same checks and limits apply.</p>
    </section>
  );
}

const Loading = () => <section className="card"><div className="empty-state">Loading…</div></section>;

/** Data tab (Phase 17, deliverable 6): full export and reconciliation checks. */
export default function TenantDataPage({ params }: { params: Params }) {
  return (
    <div className="settings-form">
      <Suspense fallback={<Loading />}>
        <Export params={params} />
      </Suspense>
      <Suspense fallback={<Loading />}>
        <HealthChecks params={params} />
      </Suspense>
    </div>
  );
}
