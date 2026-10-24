"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Loader2, Search, X } from "lucide-react";
import { applicableAttributes, type Attribute } from "@/lib/attributes";
import { buildCategoryIndex, fullPath, type Category } from "@/lib/categories";
import { SEARCH_DELAY_MS } from "@/lib/search-delay";
import { ATTR_PARAM } from "@/lib/validations/inventory.schema";
import { CategoryPicker } from "./category-picker";

const STOCK_LABEL: Record<string, string> = { in: "In stock", low: "Low stock", out: "Out of stock" };
const FITMENT_LABEL: Record<string, string> = { universal: "Universal Fit", specific: "Vehicle Specific" };

type Props = {
  categories: Category[];
  /** Items per category id, for the counts in the category picker. */
  counts: Record<string, number>;
  /** Attribute definitions: list and yes/no ones become filters (RF-18.1). */
  attributes: Attribute[];
  /** Vehicle Fitment module on: shows the fitment filter. */
  fitment: boolean;
};

/**
 * Search / category / stock / fitment / attribute filters and sort. State lives in the URL
 * (?q=&category=&stock=&fitment=&sort=&attr.<key>=) so a filtered view can be refreshed,
 * bookmarked or shared; the server page re-queries whenever it changes.
 */
export function InventoryFilters({ categories, counts, attributes, fitment: fitmentModule }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();
  const index = useMemo(() => buildCategoryIndex(categories, counts), [categories, counts]);

  const category = params.get("category") ?? "";
  const stock = params.get("stock") ?? "";
  const fitment = params.get("fitment") ?? "";
  const sort = params.get("sort") ?? "";
  const urlSearch = params.get("q") ?? "";
  const [search, setSearch] = useState(urlSearch);
  // The last search the box itself sent, so its own URL update can't overwrite newer typing.
  const [typedSearch, setTypedSearch] = useState(urlSearch);

  // Keep the box in step when the URL changes elsewhere (bell, global search, Clear all).
  const [lastUrlSearch, setLastUrlSearch] = useState(urlSearch);
  if (urlSearch !== lastUrlSearch) {
    setLastUrlSearch(urlSearch);
    if (urlSearch !== typedSearch) setSearch(urlSearch);
  }

  const update = (changes: Record<string, string>) => {
    const next = new URLSearchParams(params);
    for (const [key, value] of Object.entries(changes)) {
      if (value) next.set(key, value);
      else next.delete(key);
    }
    next.delete("page"); // a new filter or sort starts again at page 1
    const qs = next.toString();
    startTransition(() => router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false }));
  };

  // Debounce typing into the URL.
  useEffect(() => {
    if (search.trim() === urlSearch) return;
    const timer = setTimeout(() => {
      setTypedSearch(search.trim());
      update({ q: search.trim() });
    }, SEARCH_DELAY_MS);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only re-run on typing
  }, [search]);

  const selectedCategory = category ? index.byId.get(category) : undefined;

  // List and yes/no attributes for the chosen category (the unscoped ones when none is chosen), plus any
  // already in the URL so their chip can be removed.
  const filterable = (a: Attribute) => a.type === "select" || a.type === "boolean";
  const offered = (selectedCategory ? applicableAttributes(attributes, index, category) : attributes.filter((a) => !a.category_id && !a.is_archived)).filter(filterable);
  const activeAttributes = attributes.filter((a) => filterable(a) && params.get(ATTR_PARAM + a.key));
  const attributeFilters = [...offered, ...activeAttributes.filter((a) => !offered.includes(a))];
  const attrLabel = (a: Attribute, value: string) => `${a.label}: ${a.type === "boolean" ? (value === "yes" ? "Yes" : "No") : value}`;

  const chips = [
    urlSearch && { key: "q", label: `“${urlSearch}”` },
    category && { key: "category", label: selectedCategory ? fullPath(selectedCategory) : "Unknown category" },
    stock && { key: "stock", label: STOCK_LABEL[stock] ?? stock },
    fitmentModule && fitment && { key: "fitment", label: FITMENT_LABEL[fitment] ?? fitment },
    ...activeAttributes.map((a) => ({ key: ATTR_PARAM + a.key, label: attrLabel(a, params.get(ATTR_PARAM + a.key) ?? "") })),
  ].filter(Boolean) as { key: string; label: string }[];

  return (
    <section className="card filter-card inventory-filter-card">
      <div className="inventory-filter-row">
        <div className="inventory-search">
          {pending ? <Loader2 size={16} className="animate-spin" /> : <Search size={16} />}
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={fitmentModule ? "Search SKU, product name, category or vehicle (e.g. Corolla 2025)..." : "Search SKU, product name or category..."}
            aria-label="Search inventory"
            maxLength={100}
          />
          {search && (
            <button type="button" className="search-clear" aria-label="Clear search" onClick={() => setSearch("")}>
              <X size={14} />
            </button>
          )}
        </div>
        <CategoryPicker
          key={category || "all"}
          index={index}
          value={selectedCategory ? category : null}
          onChange={(id) => update({ category: id ?? "" })}
          allowAll
        />
        <select className="filter-select" aria-label="Stock" value={stock} onChange={(e) => update({ stock: e.target.value })}>
          <option value="">All stock levels</option>
          <option value="in">In stock</option>
          <option value="low">Low stock</option>
          <option value="out">Out of stock</option>
        </select>
        {fitmentModule && (
          <select className="filter-select" aria-label="Fitment type" value={fitment} onChange={(e) => update({ fitment: e.target.value })}>
            <option value="">All fitment types</option>
            <option value="universal">Universal Fit</option>
            <option value="specific">Vehicle Specific</option>
          </select>
        )}
        {attributeFilters.map((a) => (
          <select
            key={a.id}
            className="filter-select"
            aria-label={a.label}
            value={params.get(ATTR_PARAM + a.key) ?? ""}
            onChange={(e) => update({ [ATTR_PARAM + a.key]: e.target.value })}
          >
            <option value="">{`${a.label}: any`}</option>
            {a.type === "boolean" ? (
              <>
                <option value="yes">{`${a.label}: Yes`}</option>
                <option value="no">{`${a.label}: No`}</option>
              </>
            ) : (
              a.options.map((o) => (
                <option key={o} value={o}>{o}</option>
              ))
            )}
          </select>
        ))}
        <select className="filter-select" aria-label="Sort by" value={sort} onChange={(e) => update({ sort: e.target.value })}>
          <option value="">Sort: Name A–Z</option>
          <option value="newest">Sort: Newest first</option>
          <option value="stock">Sort: Lowest stock</option>
          <option value="price-high">Sort: Price high → low</option>
          <option value="price-low">Sort: Price low → high</option>
        </select>
      </div>
      {chips.length > 0 && (
        <div className="filter-chips" aria-label="Active filters">
          {chips.map((chip) => (
            <button
              key={chip.key}
              type="button"
              className="filter-chip"
              aria-label={`Remove filter ${chip.label}`}
              onClick={() => {
                if (chip.key === "q") setSearch("");
                update({ [chip.key]: "" });
              }}
            >
              {chip.label} <X size={12} />
            </button>
          ))}
          <button
            type="button"
            className="filter-clear"
            onClick={() => {
              setSearch("");
              update({ q: "", category: "", stock: "", fitment: "", ...Object.fromEntries(activeAttributes.map((a) => [ATTR_PARAM + a.key, ""])) });
            }}
          >
            Clear all
          </button>
        </div>
      )}
    </section>
  );
}
