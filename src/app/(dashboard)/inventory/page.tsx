import { Suspense } from "react";
import type { Metadata } from "next";
import { Plus } from "lucide-react";
import { getInventoryItems } from "@/lib/actions/inventory";
import { getShopSession } from "@/lib/auth";
import { getCategories, getCategoryCounts } from "@/lib/category-data";
import { inventoryFiltersSchema } from "@/lib/validations/inventory.schema";
import { AddItemButton } from "@/components/inventory/add-item-button";
import { InventoryFilters } from "@/components/inventory/inventory-filters";
import { InventoryTable } from "@/components/inventory/inventory-table";

export const metadata: Metadata = { title: "Inventory" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

async function AddItemAction() {
  const [{ tenant }, categories] = await Promise.all([getShopSession(), getCategories()]);
  return <AddItemButton currency={tenant.currency} pricesIncludeTax={tenant.pricesIncludeTax} categories={categories} />;
}

async function FiltersSection() {
  const [categories, counts] = await Promise.all([getCategories(), getCategoryCounts()]);
  return <InventoryFilters categories={categories} counts={counts} />;
}

async function InventoryResults({ searchParams }: { searchParams: SearchParams }) {
  const raw = await searchParams;
  const filters = inventoryFiltersSchema.parse({
    category: first(raw.category),
    search: first(raw.q) || undefined,
    fitment: first(raw.fitment),
    stock: first(raw.stock),
    sort: first(raw.sort),
  });
  const [items, { tenant }, categories] = await Promise.all([getInventoryItems(filters), getShopSession(), getCategories()]);
  const filtered = Boolean(filters.category || filters.search || filters.fitment || filters.stock);
  return (
    <InventoryTable
      items={items}
      money={tenant.money}
      pricesIncludeTax={tenant.pricesIncludeTax}
      categories={categories}
      filtered={filtered}
    />
  );
}

function ResultsSkeleton() {
  return (
    <section className="card inventory-table-card">
      <div className="inventory-summary"><div><h2>All inventory</h2></div></div>
      <div className="empty-state">Loading inventory…</div>
    </section>
  );
}

export default function InventoryPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <div className="page">
      <div className="page-heading inventory-heading">
        <div>
          <span className="eyebrow">CATALOG MANAGEMENT</span>
          <h1>Inventory &amp; Fitment</h1>
          <p>Manage products, stock levels, margins, and vehicle compatibility.</p>
        </div>
        <div className="heading-actions">
          <Suspense
            fallback={
              <button type="button" className="button button-primary" disabled>
                <Plus size={14} /> Add New Part
              </button>
            }
          >
            <AddItemAction />
          </Suspense>
        </div>
      </div>
      <Suspense fallback={<section className="card filter-card" aria-hidden="true" />}>
        <FiltersSection />
      </Suspense>
      <Suspense fallback={<ResultsSkeleton />}>
        <InventoryResults searchParams={searchParams} />
      </Suspense>
    </div>
  );
}
