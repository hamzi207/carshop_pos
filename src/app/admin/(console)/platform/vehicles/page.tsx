import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { AdminFilters } from "@/components/admin/admin-filters";
import { VehicleCatalogManager } from "@/components/admin/vehicle-catalog-manager";
import { PaginationBar } from "@/components/ui/pagination-bar";
import { getVehicles, VEHICLE_SCOPES, type VehicleScope } from "@/lib/admin-data";
import { parsePagination } from "@/lib/pagination";

export const metadata: Metadata = { title: "Vehicle catalog" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

async function Vehicles({ searchParams }: { searchParams: SearchParams }) {
  const raw = await searchParams;
  const scope = (first(raw.status) ?? "all") in VEHICLE_SCOPES ? ((first(raw.status) ?? "all") as VehicleScope) : "all";
  const year = Number(first(raw.year));
  const result = await getVehicles(
    { search: (first(raw.q) ?? "").trim().slice(0, 100), year: Number.isInteger(year) && year >= 1960 ? year : null, scope },
    parsePagination({ page: first(raw.page), limit: first(raw.limit) }),
  );
  return (
    <>
      {/* Remount (clearing the selection) when the page of results changes. */}
      <VehicleCatalogManager key={result.rows.map((r) => r.id).join(",")} rows={result.rows} />
      <PaginationBar total={result.total} page={result.page} limit={result.limit} noun={["vehicle", "vehicles"]} />
    </>
  );
}

async function Filters({ searchParams }: { searchParams: SearchParams }) {
  // After a request read: the current year is request-time data.
  await searchParams;
  const thisYear = new Date().getFullYear();
  const years = Array.from({ length: thisYear + 2 - 1960 }, (_, i) => String(thisYear + 1 - i));
  return (
    <AdminFilters
      placeholder="Search make, model or year, e.g. corolla 2015"
      label="Search vehicles"
      statuses={Object.entries(VEHICLE_SCOPES).map(([value, label]) => ({ value: value === "all" ? "" : value, label }))}
      selects={[{ key: "year", label: "Year", options: [{ value: "", label: "Any year" }, ...years.map((y) => ({ value: y, label: y }))] }]}
    />
  );
}

/** /admin/platform/vehicles (Phase 17, deliverable 5): the year / make / model catalog every shop picks from. */
export default function VehicleCatalogPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <div className="page">
      <div className="page-heading">
        <div>
          <Link href="/admin/platform" className="admin-crumb"><ArrowLeft size={13} /> Platform</Link>
          <h1>Vehicle catalog</h1>
          <p>The vehicles every shop picks for fitment. Deactivated rows are hidden from pickers; items already linked keep them.</p>
        </div>
      </div>
      <section className="card customer-card">
        <Suspense>
          <Filters searchParams={searchParams} />
        </Suspense>
        <Suspense fallback={<div className="empty-state">Loading vehicles…</div>}>
          <Vehicles searchParams={searchParams} />
        </Suspense>
      </section>
    </div>
  );
}
