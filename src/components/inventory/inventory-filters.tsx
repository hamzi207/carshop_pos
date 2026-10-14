"use client";

import { useEffect, useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Loader2, Search, X } from "lucide-react";
import { INVENTORY_CATEGORIES, type InventoryCategory } from "@/lib/validations/inventory.schema";

const PILL_LABEL: Partial<Record<InventoryCategory, string>> = {
  "Hardware / Chemicals": "Chemicals",
};

/**
 * Search / category / fitment filters. State lives in the URL (?q=&category=&fitment=)
 * so a filtered view can be refreshed, bookmarked or shared; the server page
 * re-queries whenever it changes.
 */
export function InventoryFilters() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();

  const category = params.get("category") ?? "";
  const fitment = params.get("fitment") ?? "";
  const urlSearch = params.get("q") ?? "";
  const [search, setSearch] = useState(urlSearch);

  const update = (changes: Record<string, string>) => {
    const next = new URLSearchParams(params);
    for (const [key, value] of Object.entries(changes)) {
      if (value) next.set(key, value);
      else next.delete(key);
    }
    const qs = next.toString();
    startTransition(() => router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false }));
  };

  // Debounce typing into the URL.
  useEffect(() => {
    if (search.trim() === urlSearch) return;
    const timer = setTimeout(() => update({ q: search.trim() }), 300);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only re-run on typing
  }, [search]);

  return (
    <section className="card filter-card">
      <div className="inventory-search">
        {pending ? <Loader2 size={16} className="animate-spin" /> : <Search size={16} />}
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search SKU, part name or vehicle (e.g. Corolla 2025)..."
          aria-label="Search inventory"
          maxLength={100}
        />
        {search && (
          <button type="button" className="search-clear" aria-label="Clear search" onClick={() => setSearch("")}>
            <X size={14} />
          </button>
        )}
      </div>
      <div className="category-pills" role="group" aria-label="Category">
        {["", ...INVENTORY_CATEGORIES].map((c) => (
          <button
            key={c || "all"}
            type="button"
            className={category === c ? "active" : ""}
            aria-pressed={category === c}
            onClick={() => update({ category: c })}
          >
            {c ? (PILL_LABEL[c as InventoryCategory] ?? c) : "All Items"}
          </button>
        ))}
      </div>
      <select
        className="filter-select"
        aria-label="Fitment type"
        value={fitment}
        onChange={(e) => update({ fitment: e.target.value })}
      >
        <option value="">All fitment types</option>
        <option value="universal">Universal Fit</option>
        <option value="specific">Vehicle Specific</option>
      </select>
    </section>
  );
}
