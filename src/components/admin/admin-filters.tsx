"use client";

import { useEffect, useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Loader2, Search, X } from "lucide-react";

type Props = {
  placeholder: string;
  label: string;
  /** Optional pills for ?status= ("" = all). */
  statuses?: { value: string; label: string }[];
  /** Optional dropdowns, each its own URL key ("" = not set). */
  selects?: { key: string; label: string; options: { value: string; label: string }[] }[];
};

/** Search (?q=) + optional status pills (?status=) in the URL, like the customer filters. */
export function AdminFilters({ placeholder, label, statuses, selects }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();

  const status = params.get("status") ?? "";
  const urlSearch = params.get("q") ?? "";
  const [search, setSearch] = useState(urlSearch);

  const update = (changes: Record<string, string>) => {
    const next = new URLSearchParams(params);
    for (const [key, value] of Object.entries(changes)) {
      if (value) next.set(key, value);
      else next.delete(key);
    }
    next.delete("page"); // a new filter starts again at page 1
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
          placeholder={placeholder}
          aria-label={label}
          maxLength={100}
        />
        {search && (
          <button type="button" className="search-clear" aria-label="Clear search" onClick={() => setSearch("")}>
            <X size={14} />
          </button>
        )}
      </div>
      {selects?.map((f) => (
        <select
          key={f.key}
          className="admin-filter-select"
          aria-label={f.label}
          value={params.get(f.key) ?? ""}
          onChange={(e) => update({ [f.key]: e.target.value })}
        >
          {f.options.map((o) => (
            <option key={o.value || "none"} value={o.value}>{o.label}</option>
          ))}
        </select>
      ))}
      {statuses && (
        <div className="category-pills" role="group" aria-label="Status">
          {statuses.map((s) => (
            <button
              key={s.value || "all"}
              type="button"
              className={status === s.value ? "active" : ""}
              aria-pressed={status === s.value}
              onClick={() => update({ status: s.value })}
            >
              {s.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
