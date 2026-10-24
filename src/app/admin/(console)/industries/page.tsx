import { Suspense } from "react";
import type { Metadata } from "next";
import { SectionTabs } from "@/components/admin/section-tabs";
import { IndustryManager } from "@/components/admin/industry-manager";
import { getIndustries } from "@/lib/admin-category-data";

export const metadata: Metadata = { title: "Industries" };

async function Industries() {
  return <IndustryManager industries={await getIndustries()} />;
}

/** Industries (Phase 18, deliverable 1): what a new organization is created with, and what it gets with it. */
export default function IndustriesPage() {
  return (
    <div className="page">
      <div className="page-heading">
        <div>
          <span className="eyebrow">CATALOG</span>
          <h1>Industries</h1>
          <p>Each industry brings its category catalog, default modules, units, tax setting and setup checklist. Changes apply to new organizations.</p>
        </div>
      </div>
      <SectionTabs section="catalog" />
      <Suspense fallback={<section className="card"><div className="empty-state">Loading industries…</div></section>}>
        <Industries />
      </Suspense>
    </div>
  );
}
