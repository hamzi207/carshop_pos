import { Suspense } from "react";
import type { Metadata } from "next";
import { AttributeManager } from "@/components/admin/attribute-manager";
import { SectionTabs } from "@/components/admin/section-tabs";
import { IndustryList, pickIndustry } from "@/components/admin/industry-list";
import { getCatalog, getIndustries } from "@/lib/admin-category-data";

export const metadata: Metadata = { title: "Attributes" };

type SearchParams = Promise<{ industry?: string }>;

async function Attributes({ searchParams }: { searchParams: SearchParams }) {
  const [{ industry }, industries] = await Promise.all([searchParams, getIndustries()]);
  const current = pickIndustry(industries, industry);
  if (!current) return <section className="card"><div className="empty-state"><strong>Add an industry first</strong></div></section>;
  const { categories, attributes } = await getCatalog(current.id);
  return (
    <div className="catalog-layout">
      <IndustryList industries={industries} currentId={current.id} basePath="/admin/attributes" />
      <div className="catalog-main">
        <AttributeManager key={current.id} scope={{ industryId: current.id }} title={`${current.name} attributes`} attributes={attributes} categories={categories} />
      </div>
    </div>
  );
}

/** Product attributes (Phase 18, RF-18.1): extra product fields per industry. One organization's own ones are on its Categories tab. */
export default function AttributesPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <div className="page">
      <div className="page-heading">
        <div>
          <span className="eyebrow">CATALOG</span>
          <h1>Attributes</h1>
          <p>Extra product fields for every organization in an industry, e.g. Brand, Warranty months or Expiry date. An organization&apos;s own attributes are on its Categories tab.</p>
        </div>
      </div>
      <SectionTabs section="catalog" />
      <Suspense fallback={<section className="card"><div className="empty-state">Loading attributes…</div></section>}>
        <Attributes searchParams={searchParams} />
      </Suspense>
    </div>
  );
}
