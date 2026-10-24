import { Suspense } from "react";
import type { Metadata } from "next";
import { CatalogTools } from "@/components/admin/catalog-tools";
import { SectionTabs } from "@/components/admin/section-tabs";
import { CategoryCatalogEditor } from "@/components/admin/category-catalog-editor";
import { IndustryList, pickIndustry } from "@/components/admin/industry-list";
import { getCatalog, getIndustries } from "@/lib/admin-category-data";

export const metadata: Metadata = { title: "Categories" };

type SearchParams = Promise<{ industry?: string }>;

async function Catalog({ searchParams }: { searchParams: SearchParams }) {
  const [{ industry }, industries] = await Promise.all([searchParams, getIndustries()]);
  const current = pickIndustry(industries, industry);
  if (!current) return <section className="card"><div className="empty-state"><strong>Add an industry first</strong></div></section>;
  const { categories, items, orgs } = await getCatalog(current.id);
  return (
    <div className="catalog-layout">
      <IndustryList industries={industries} currentId={current.id} basePath="/admin/categories" />
      <div className="catalog-main">
        <CategoryCatalogEditor key={current.id} scope={{ industryId: current.id }} title={`${current.name} catalog`} categories={categories} counts={items} orgs={orgs} />
        <CatalogTools industryId={current.id} empty={categories.length === 0} others={industries.filter((i) => i.id !== current.id).map((i) => ({ id: i.id, name: i.name, categories: i.categories }))} />
      </div>
    </div>
  );
}

/** Category catalogs (Phase 18, deliverable 3): each industry's tree, which every organization in it shares. */
export default function CategoriesPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <div className="page">
      <div className="page-heading">
        <div>
          <span className="eyebrow">CATALOG</span>
          <h1>Categories</h1>
          <p>Every industry&apos;s category tree. Organizations see their industry&apos;s tree and can only request changes.</p>
        </div>
      </div>
      <SectionTabs section="catalog" />
      <Suspense fallback={<section className="card"><div className="empty-state">Loading categories…</div></section>}>
        <Catalog searchParams={searchParams} />
      </Suspense>
    </div>
  );
}
