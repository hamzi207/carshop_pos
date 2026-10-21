import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { Download, ScrollText } from "lucide-react";
import { AdminFilters } from "@/components/admin/admin-filters";
import { adminDateTime, describeAction } from "@/components/admin/format";
import { PaginationBar } from "@/components/ui/pagination-bar";
import { getSuperadmins } from "@/lib/admin-data";
import { AUDIT_GROUPS, AUDIT_PERIODS, getAuditLog, parseAuditFilters } from "@/lib/audit-data";
import { parsePagination } from "@/lib/pagination";
import { createAdminClient } from "@/lib/supabase/admin";

export const metadata: Metadata = { title: "Audit log" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

async function AuditList({ searchParams }: { searchParams: SearchParams }) {
  const raw = await searchParams;
  const filters = parseAuditFilters((k) => first(raw[k]));
  const result = await getAuditLog(filters, parsePagination({ page: first(raw.page), limit: first(raw.limit) }));
  const exportQs = new URLSearchParams(Object.entries(raw).flatMap(([k, v]) => (k !== "page" && k !== "limit" && typeof v === "string" && v ? [[k, v]] : [])));

  return (
    <>
      <div className="audit-toolbar">
        <span>{result.total.toLocaleString("en-PK")} {result.total === 1 ? "entry" : "entries"}</span>
        <a className="button" href={`/api/admin/audit/export${exportQs.size ? `?${exportQs}` : ""}`}><Download size={14} /> Export CSV</a>
      </div>
      {result.rows.length === 0 ? (
        <div className="empty-state">
          <span className="header-icon blue"><ScrollText size={18} /></span>
          <strong>Nothing matches</strong>
        </div>
      ) : (
        <ul className="audit-list">
          {result.rows.map((e) => (
            <li key={e.id}>
              <details>
                <summary>
                  <span className="audit-what">
                    <strong>{e.adminName}</strong> · {describeAction(e.action, e.details)}
                    {e.tenantId && (
                      <> · <Link href={`/admin/tenants/${e.tenantId}`} className="detail-link">{e.tenantName ?? "Organization"}</Link></>
                    )}
                    {e.reason && <em className="audit-reason">“{e.reason}”</em>}
                  </span>
                  <time dateTime={e.createdAt}>{adminDateTime(e.createdAt)}</time>
                </summary>
                <dl className="audit-details">
                  <div><dt>Action</dt><dd className="mono">{e.action}</dd></div>
                  {e.userEmail && <div><dt>User</dt><dd>{e.userEmail}</dd></div>}
                  {e.ip && <div><dt>IP</dt><dd className="mono">{e.ip}</dd></div>}
                  <div className="audit-json"><dt>Details</dt><dd><pre>{JSON.stringify(e.details, null, 2)}</pre></dd></div>
                </dl>
              </details>
            </li>
          ))}
        </ul>
      )}
      <PaginationBar total={result.total} page={result.page} limit={result.limit} noun={["entry", "entries"]} />
    </>
  );
}

async function Filters({ searchParams }: { searchParams: SearchParams }) {
  const raw = await searchParams;
  const tenantId = parseAuditFilters((k) => first(raw[k])).tenantId;
  const [admins, tenant] = await Promise.all([
    getSuperadmins(),
    tenantId ? createAdminClient().from("tenants").select("id, name").eq("id", tenantId).maybeSingle() : Promise.resolve({ data: null }),
  ]);
  return (
    <AdminFilters
      placeholder="Search action, e.g. archive, payment, role..."
      label="Search the audit log"
      selects={[
        ...(tenant.data ? [{ key: "tenant", label: "Organization", options: [{ value: tenant.data.id, label: tenant.data.name }, { value: "", label: "All organizations" }] }] : []),
        { key: "group", label: "Area", options: [{ value: "", label: "Every area" }, ...Object.entries(AUDIT_GROUPS).map(([value, label]) => ({ value, label }))] },
        { key: "admin", label: "Superadmin", options: [{ value: "", label: "Every superadmin" }, ...admins.map((a) => ({ value: a.id, label: a.fullName }))] },
        { key: "days", label: "Period", options: [{ value: "", label: "All time" }, ...Object.entries(AUDIT_PERIODS).map(([value, label]) => ({ value, label }))] },
      ]}
    />
  );
}

/** /admin/audit (Phase 17, deliverable 7): every superadmin action and "Login As" change. */
export default function AuditPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <div className="page">
      <div className="page-heading">
        <div>
          <span className="eyebrow">PLATFORM</span>
          <h1>Audit log</h1>
          <p>Everything superadmins did, from the console or while acting as an organization. Open a row for the full details.</p>
        </div>
      </div>
      <section className="card customer-card">
        <Suspense>
          <Filters searchParams={searchParams} />
        </Suspense>
        <Suspense fallback={<div className="empty-state">Loading…</div>}>
          <AuditList searchParams={searchParams} />
        </Suspense>
      </section>
    </div>
  );
}
