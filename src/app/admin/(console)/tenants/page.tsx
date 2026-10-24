import { Suspense, type CSSProperties } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { CalendarClock, Store } from "lucide-react";
import { AdminFilters } from "@/components/admin/admin-filters";
import { CreateOrganizationButton } from "@/components/admin/create-organization";
import { getIndustryChoices, getSetupProgress } from "@/lib/admin-category-data";
import { adminDate, adminMoney, statusBadge } from "@/components/admin/format";
import { HealthBadge } from "@/components/admin/tenant-health";
import { TenantActions } from "@/components/admin/tenant-actions";
import { PaginationBar } from "@/components/ui/pagination-bar";
import { SectionTabs } from "@/components/admin/section-tabs";
import { getAdminTags, getTenants, HEALTH_BANDS, parseTenantStatus, TENANT_SORTS, type TenantFilters, type TenantRow } from "@/lib/admin-data";
import { ARCHIVE_PALETTE, archiveAge, archiveStyle } from "@/lib/archive-colour";
import { parsePagination } from "@/lib/pagination";
import { getPlans } from "@/lib/plan-data";
import { formatPhone } from "@/lib/phone";
import { TENANT_STATUSES, TENANT_STATUS_LABEL } from "@/lib/validations/admin.schema";

export const metadata: Metadata = { title: "Organizations" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

const STATUS_PILLS = [
  { value: "", label: "All organizations" },
  ...TENANT_STATUSES.map((s) => ({ value: s, label: TENANT_STATUS_LABEL[s] })),
  { value: "archived", label: "Archived" },
];

const SORT_LABEL: Record<(typeof TENANT_SORTS)[number], string> = {
  newest: "Newest first",
  name: "Name A–Z",
  health: "Lowest health first",
  last_sign_in: "Last signed in",
  sales: "Most sales",
  due: "Next payment due",
  archived: "Archived longest",
};

const BAND_LABEL = { healthy: "Healthy", watch: "Watch", at_risk: "At risk" } as const;

type Tag = { id: string; name: string; color: string };
const tagsOf = (t: TenantRow) => (Array.isArray(t.tags) ? (t.tags as Tag[]) : []);

function Tags({ row }: { row: TenantRow }) {
  const tags = tagsOf(row);
  if (!tags.length) return null;
  return (
    <span className="tag-chips">
      {tags.map((g) => (
        <span key={g.id} className="tag-chip" style={{ "--tag": g.color } as CSSProperties}>{g.name}</span>
      ))}
    </span>
  );
}

function parseFilters(raw: Record<string, string | string[] | undefined>): TenantFilters {
  const status = first(raw.status);
  const archived = status === "archived";
  const tag = first(raw.tag) ?? "";
  const band = first(raw.health) ?? "";
  const sort = first(raw.sort) ?? "";
  return {
    search: (first(raw.q) ?? "").trim().slice(0, 100),
    status: archived ? null : parseTenantStatus(status),
    archived,
    tag: /^[0-9a-f-]{36}$/i.test(tag) ? tag : null,
    band: (HEALTH_BANDS as readonly string[]).includes(band) ? (band as TenantFilters["band"]) : null,
    // The archive defaults to "archived longest".
    sort: (TENANT_SORTS as readonly string[]).includes(sort) ? (sort as TenantFilters["sort"]) : archived ? "archived" : "newest",
  };
}

async function TenantList({ searchParams }: { searchParams: SearchParams }) {
  const raw = await searchParams;
  const filters = parseFilters(raw);
  const pagination = parsePagination({ page: first(raw.page), limit: first(raw.limit) });
  const [result, setup] = await Promise.all([getTenants(filters, pagination), getSetupProgress()]);
  // Past the last page (a stale link): back to page 1 with the same filters.
  if (result.rows.length === 0 && pagination.page > 1) {
    const qs = new URLSearchParams(Object.entries(raw).flatMap(([k, v]) => (k !== "page" && typeof v === "string" && v ? [[k, v]] : [])));
    redirect(`/admin/tenants${qs.size ? `?${qs}` : ""}`);
  }

  if (result.rows.length === 0) {
    const filtered = filters.search || filters.status || filters.tag || filters.band;
    return (
      <div className="empty-state">
        <span className="header-icon blue"><Store size={18} /></span>
        <strong>
          {filters.archived ? (filtered ? "No archived organizations match" : "Nothing is archived") : filtered ? "No organizations match" : "No organizations yet"}
        </strong>
      </div>
    );
  }

  const now = new Date();
  return (
    <>
      {filters.archived && (
        <div className="archive-legend" aria-label="Archive age colours">
          <span>Archived today</span>
          <span className="archive-legend-bar" aria-hidden="true">
            {ARCHIVE_PALETTE.map((c) => <span key={c.bg} style={{ background: c.bg }} />)}
          </span>
          <span>A year or more</span>
        </div>
      )}
      <div className="table-wrap desktop-table">
        <table className="admin-table">
          <thead>
            <tr>
              <th>ORGANIZATION</th>
              <th>OWNER</th>
              <th>STATUS</th>
              <th>HEALTH</th>
              <th>SETUP</th>
              <th>USERS</th>
              <th>SALES</th>
              <th>LAST SIGN-IN</th>
              <th>{filters.archived ? "ARCHIVED" : "CREATED"}</th>
              <th><span className="sr-only">Actions</span></th>
            </tr>
          </thead>
          <tbody>
            {result.rows.map((t) => {
              const badge = statusBadge(t.status);
              return (
                <tr key={t.id} className={t.archived_at ? "archived-row" : undefined} style={t.archived_at ? archiveStyle(t.archived_at, now) : undefined}>
                  <td className="primary-cell">
                    <strong><Link href={`/admin/tenants/${t.id}`} className="row-link">{t.name}</Link></strong>
                    <span className="mono">{t.slug}{t.phone ? ` · ${formatPhone(t.phone)}` : ""}</span>
                    <Tags row={t} />
                  </td>
                  <td className="primary-cell">
                    <strong>{t.owner_name ?? "—"}</strong>
                    <span>{t.owner_email ?? ""}</span>
                  </td>
                  <td className="primary-cell">
                    <span><span className={badge.tone}>{badge.label}</span></span>
                    <span>{t.plan_name ?? "No plan"}</span>
                    {t.next_follow_up && (
                      <span className="admin-follow-up"><CalendarClock size={11} /> Follow up {adminDate(t.next_follow_up)}</span>
                    )}
                  </td>
                  <td>{t.archived_at ? "—" : <HealthBadge score={t.health_score} band={t.health_band} />}</td>
                  <td><SetupCell progress={setup.get(t.id)} /></td>
                  <td>{t.users}</td>
                  <td className="amount">
                    {adminMoney(Number(t.sales), t.currency)}
                    <span className="admin-muted"> · {t.invoices} inv.</span>
                  </td>
                  <td>{adminDate(t.last_sign_in_at)}</td>
                  <td>{t.archived_at ? <span className="archive-age">{archiveAge(t.archived_at, now)}</span> : adminDate(t.created_at)}</td>
                  <td><TenantActions tenantId={t.id} name={t.name} status={t.status} archived={t.archived_at !== null} /></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <ul className="mobile-cards" aria-label="Organizations">
        {result.rows.map((t) => {
          const badge = statusBadge(t.status);
          return (
            <li
              key={t.id}
              className={`mobile-card${t.archived_at ? " archived-row" : ""}`}
              style={t.archived_at ? archiveStyle(t.archived_at, now) : undefined}
            >
              <Link href={`/admin/tenants/${t.id}`} className="mobile-card-main">
                <span className="mobile-card-top">
                  <span className="mobile-card-title">{t.name}</span>
                  {t.archived_at ? <span className="archive-age">{archiveAge(t.archived_at, now)}</span> : <span className={badge.tone}>{badge.label}</span>}
                </span>
                <span className="mobile-card-meta">
                  <span className="mobile-card-muted">
                    {t.owner_email ?? t.slug} · {t.users} {Number(t.users) === 1 ? "user" : "users"}
                    {setup.get(t.id)?.total ? ` · Setup ${setupPercent(setup.get(t.id)!)}%` : ""}
                  </span>
                  <span>{adminMoney(Number(t.sales), t.currency)}</span>
                </span>
                <Tags row={t} />
              </Link>
              <span className="mobile-card-actions">
                <TenantActions tenantId={t.id} name={t.name} status={t.status} archived={t.archived_at !== null} />
              </span>
            </li>
          );
        })}
      </ul>
      <PaginationBar total={result.total} page={result.page} limit={result.limit} noun={["organization", "organizations"]} />
    </>
  );
}

/** Same rounding as percentDone() on the shop's own card. */
const setupPercent = ({ done, total }: { done: number; total: number }) => (total ? Math.round((done / total) * 100) : 0);

/** RF-18.3: "44%" with a small bar; the tooltip says how many steps. */
function SetupCell({ progress }: { progress: { done: number; total: number } | undefined }) {
  if (!progress?.total) return <span className="admin-muted">—</span>;
  const pct = setupPercent(progress);
  return (
    <span className="setup-cell" title={`${progress.done} of ${progress.total} setup steps done`}>
      <span className="setup-bar" style={{ "--pct": `${pct}%` } as CSSProperties} aria-hidden />
      {pct}%
    </span>
  );
}

async function CreateButton() {
  const [plans, industries] = await Promise.all([getPlans(), getIndustryChoices()]);
  const choices = plans
    .filter((p) => !p.retiredAt)
    .map((p) => ({ id: p.id, name: p.name, monthly: p.priceMonthly !== null, yearly: p.priceYearly !== null, isDefault: p.isDefault }));
  return <CreateOrganizationButton plans={choices} industries={industries} />;
}

async function Filters() {
  const tags = await getAdminTags();
  return (
    <AdminFilters
      placeholder="Search organization name, handle, phone or owner email..."
      label="Search organizations"
      statuses={STATUS_PILLS}
      selects={[
        { key: "tag", label: "Tag", options: [{ value: "", label: "Any tag" }, ...tags.map((g) => ({ value: g.id, label: g.name }))] },
        { key: "health", label: "Health", options: [{ value: "", label: "Any health" }, ...HEALTH_BANDS.map((b) => ({ value: b, label: BAND_LABEL[b] }))] },
        { key: "sort", label: "Sort", options: [{ value: "", label: "Default order" }, ...TENANT_SORTS.map((s) => ({ value: s, label: SORT_LABEL[s] }))] },
      ]}
    />
  );
}

export default function TenantsPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <div className="page">
      <div className="page-heading">
        <div>
          <span className="eyebrow">SHOPS</span>
          <h1>Organizations</h1>
          <p>Every organization on the platform: open one, act as it, change its status, or archive it.</p>
        </div>
        <div className="heading-actions">
          <Suspense>
            <CreateButton />
          </Suspense>
        </div>
      </div>
      <SectionTabs section="shops" />
      <section className="card customer-card">
        <Suspense>
          <Filters />
        </Suspense>
        <Suspense fallback={<div className="empty-state">Loading organizations…</div>}>
          <TenantList searchParams={searchParams} />
        </Suspense>
      </section>
    </div>
  );
}
