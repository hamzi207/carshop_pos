import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ShieldCheck } from "lucide-react";
import { ActivityList } from "@/components/admin/activity-list";
import { adminDate, adminMoney, statusBadge } from "@/components/admin/format";
import { TenantActions } from "@/components/admin/tenant-actions";
import { RoleSelect, UserActions } from "@/components/admin/user-actions";
import { ShopProfileForm } from "@/components/settings/shop-profile-form";
import { UnsavedSettings } from "@/components/settings/unsaved-settings";
import { getRecentActivity, getTenantDetail } from "@/lib/admin-data";
import { formatPhone } from "@/lib/phone";
import { formatStrn } from "@/lib/tax-id";

export const metadata: Metadata = { title: "Shop" };

type Params = Promise<{ id: string }>;

async function TenantDetail({ params }: { params: Params }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const [detail, activity] = await Promise.all([getTenantDetail(id), getRecentActivity(15, id)]);
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
            <span className={badge.tone}>{badge.label}</span>
          </div>
          <p>
            {members.length} {members.length === 1 ? "user" : "users"} · {totals.invoices} invoices ·{" "}
            {adminMoney(totals.sales, tenant.currency)} sales · last sign-in {adminDate(totals.lastSignInAt)} · created {adminDate(tenant.created_at)}
          </p>
        </div>
        <div className="heading-actions">
          <TenantActions tenantId={tenant.id} name={tenant.name} status={tenant.status} showEdit={false} />
        </div>
      </div>

      <div className="settings-form">
        <UnsavedSettings>
          <ShopProfileForm
            tenantId={tenant.id}
            canEdit
            logoUrl={tenant.logo_url}
            facts={[
              { label: "Shop handle", value: tenant.slug, mono: true },
              { label: "Shop ID", value: tenant.id, mono: true },
              { label: "Currency · timezone", value: `${tenant.currency} · ${tenant.timezone}` },
            ]}
            initial={{
              name: tenant.name,
              phone: formatPhone(tenant.phone),
              email: tenant.email ?? "",
              address: tenant.address ?? "",
              ntn: tenant.ntn ?? "",
              strn: formatStrn(tenant.strn),
              accentColor: tenant.accent_color ?? "",
            }}
          />
        </UnsavedSettings>
      </div>

      <section className="card admin-section">
        <div className="card-header">
          <div>
            <h2>Users</h2>
            <p>People who sign in to this shop</p>
          </div>
        </div>
        <div className="table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>NAME</th>
                <th>ROLE</th>
                <th>LAST SIGN-IN</th>
                <th>JOINED</th>
                <th><span className="sr-only">Password</span></th>
              </tr>
            </thead>
            <tbody>
              {members.map((m) => (
                <tr key={m.id}>
                  <td className="primary-cell">
                    <strong>
                      {m.full_name}
                      {m.is_superadmin && <span className="badge badge-purple admin-super"><ShieldCheck size={11} /> Superadmin</span>}
                    </strong>
                    <span>{m.email}</span>
                  </td>
                  <td><RoleSelect userId={m.id} name={m.full_name} role={m.role} /></td>
                  <td>{adminDate(m.lastSignInAt)}</td>
                  <td>{adminDate(m.created_at)}</td>
                  <td><UserActions userId={m.id} name={m.full_name} email={m.email} role={m.role} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="card admin-section">
        <div className="card-header">
          <div>
            <h2>Superadmin activity</h2>
            <p>Everything done to or as this shop, newest first</p>
          </div>
        </div>
        <ActivityList entries={activity} />
      </section>
    </>
  );
}

export default function TenantPage({ params }: { params: Params }) {
  return (
    <div className="page settings-page">
      <Suspense fallback={<section className="card"><div className="empty-state">Loading shop…</div></section>}>
        <TenantDetail params={params} />
      </Suspense>
    </div>
  );
}
