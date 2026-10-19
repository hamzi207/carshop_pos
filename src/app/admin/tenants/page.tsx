import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Store } from "lucide-react";
import { AdminFilters } from "@/components/admin/admin-filters";
import { CreateOrganizationButton } from "@/components/admin/create-organization";
import { adminDate, adminMoney, statusBadge } from "@/components/admin/format";
import { TenantActions } from "@/components/admin/tenant-actions";
import { PaginationBar } from "@/components/ui/pagination-bar";
import { getTenants, parseTenantStatus } from "@/lib/admin-data";
import { formatPhone } from "@/lib/phone";
import { parsePagination } from "@/lib/pagination";
import { TENANT_STATUSES, TENANT_STATUS_LABEL } from "@/lib/validations/admin.schema";

export const metadata: Metadata = { title: "Shops" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

const STATUS_PILLS = [{ value: "", label: "All shops" }, ...TENANT_STATUSES.map((s) => ({ value: s, label: TENANT_STATUS_LABEL[s] }))];

async function TenantList({ searchParams }: { searchParams: SearchParams }) {
  const raw = await searchParams;
  const search = (first(raw.q) ?? "").trim().slice(0, 100);
  const status = parseTenantStatus(first(raw.status));
  const pagination = parsePagination({ page: first(raw.page), limit: first(raw.limit) });
  const result = await getTenants({ search, status }, pagination);
  // Past the last page (a stale link): back to page 1 with the same filters.
  if (result.rows.length === 0 && pagination.page > 1) {
    const qs = new URLSearchParams(Object.entries({ q: search, status: status ?? "" }).filter(([, v]) => v));
    redirect(`/admin/tenants${qs.size ? `?${qs}` : ""}`);
  }

  if (result.rows.length === 0) {
    return (
      <div className="empty-state">
        <span className="header-icon blue"><Store size={18} /></span>
        <strong>{search || status ? "No shops match" : "No shops yet"}</strong>
      </div>
    );
  }

  return (
    <>
      <div className="table-wrap desktop-table">
        <table className="admin-table">
          <thead>
            <tr>
              <th>SHOP</th>
              <th>OWNER</th>
              <th>STATUS</th>
              <th>USERS</th>
              <th>SALES</th>
              <th>LAST SIGN-IN</th>
              <th>CREATED</th>
              <th><span className="sr-only">Actions</span></th>
            </tr>
          </thead>
          <tbody>
            {result.rows.map((t) => {
              const badge = statusBadge(t.status);
              return (
                <tr key={t.id}>
                  <td className="primary-cell">
                    <strong><Link href={`/admin/tenants/${t.id}`} className="row-link">{t.name}</Link></strong>
                    <span className="mono">{t.slug}{t.phone ? ` · ${formatPhone(t.phone)}` : ""}</span>
                  </td>
                  <td className="primary-cell">
                    <strong>{t.owner_name ?? "—"}</strong>
                    <span>{t.owner_email ?? ""}</span>
                  </td>
                  <td><span className={badge.tone}>{badge.label}</span></td>
                  <td>{t.users}</td>
                  <td className="amount">
                    {adminMoney(Number(t.sales), t.currency)}
                    <span className="admin-muted"> · {t.invoices} inv.</span>
                  </td>
                  <td>{adminDate(t.last_sign_in_at)}</td>
                  <td>{adminDate(t.created_at)}</td>
                  <td><TenantActions tenantId={t.id} name={t.name} status={t.status} /></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <ul className="mobile-cards" aria-label="Shops">
        {result.rows.map((t) => {
          const badge = statusBadge(t.status);
          return (
            <li key={t.id} className="mobile-card">
              <Link href={`/admin/tenants/${t.id}`} className="mobile-card-main">
                <span className="mobile-card-top">
                  <span className="mobile-card-title">{t.name}</span>
                  <span className={badge.tone}>{badge.label}</span>
                </span>
                <span className="mobile-card-meta">
                  <span className="mobile-card-muted">{t.owner_email ?? t.slug} · {t.users} {Number(t.users) === 1 ? "user" : "users"}</span>
                  <span>{adminMoney(Number(t.sales), t.currency)}</span>
                </span>
              </Link>
              <span className="mobile-card-actions">
                <TenantActions tenantId={t.id} name={t.name} status={t.status} />
              </span>
            </li>
          );
        })}
      </ul>
      <PaginationBar total={result.total} page={result.page} limit={result.limit} noun={["shop", "shops"]} />
    </>
  );
}

export default function TenantsPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <div className="page">
      <div className="page-heading">
        <div>
          <span className="eyebrow">PLATFORM</span>
          <h1>Shops</h1>
          <p>Every organization on the platform: open one, act as it, or change its status.</p>
        </div>
        <div className="heading-actions">
          <CreateOrganizationButton />
        </div>
      </div>
      <section className="card customer-card">
        <Suspense>
          <AdminFilters placeholder="Search shop name, handle, phone or owner email..." label="Search shops" statuses={STATUS_PILLS} />
        </Suspense>
        <Suspense fallback={<div className="empty-state">Loading shops…</div>}>
          <TenantList searchParams={searchParams} />
        </Suspense>
      </section>
    </div>
  );
}
