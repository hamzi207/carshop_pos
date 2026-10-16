"use client";

import { useEffect, useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Loader2, Search, X } from "lucide-react";
import { CUSTOMER_TYPES, type CustomerType } from "@/lib/validations/customer.schema";

const PILL_LABEL: Record<CustomerType, string> = {
  Dealership: "Dealerships",
  "Fleet Account": "Fleet",
  "Retail Customer": "Retail",
};

/** Search + type filter, kept in the URL (?q=&type=) like the inventory filters. */
export function CustomerFilters() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();

  const type = params.get("type") ?? "";
  const urlSearch = params.get("q") ?? "";
  const [search, setSearch] = useState(urlSearch);

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

  useEffect(() => {
    if (search.trim() === urlSearch) return;
    const timer = setTimeout(() => update({ q: search.trim() }), 300);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only re-run on typing
  }, [search]);

  return (
    <div className="customer-filters">
      <div className="inventory-search">
        {pending ? <Loader2 size={16} className="animate-spin" /> : <Search size={16} />}
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search company, contact, phone, email or NTN..."
          aria-label="Search customers"
          maxLength={100}
        />
        {search && (
          <button type="button" className="search-clear" aria-label="Clear search" onClick={() => setSearch("")}>
            <X size={14} />
          </button>
        )}
      </div>
      <div className="category-pills" role="group" aria-label="Customer type">
        {["", ...CUSTOMER_TYPES].map((t) => (
          <button
            key={t || "all"}
            type="button"
            className={type === t ? "active" : ""}
            aria-pressed={type === t}
            onClick={() => update({ type: t })}
          >
            {t ? PILL_LABEL[t as CustomerType] : "All customers"}
          </button>
        ))}
      </div>
    </div>
  );
}
