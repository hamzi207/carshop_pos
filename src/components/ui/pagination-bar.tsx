"use client";

import { useTransition } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, Loader2 } from "lucide-react";
import { DEFAULT_PAGE_SIZE, lastPage, PAGE_SIZES } from "@/lib/pagination";

type Props = {
  total: number;
  page: number;
  limit: number;
  /** e.g. ["product", "products"] for "Showing 1–25 of 1,480 products". */
  noun: [singular: string, plural: string];
};

const fmt = new Intl.NumberFormat("en-US");

/** Page numbers around the current one, with gaps: 1 … 4 5 6 … 20. */
function pageList(page: number, last: number): (number | "gap")[] {
  const pages = new Set([1, last, page - 1, page, page + 1].filter((p) => p >= 1 && p <= last));
  if (page <= 3) [2, 3, 4].forEach((p) => p <= last && pages.add(p));
  if (page >= last - 2) [last - 3, last - 2, last - 1].forEach((p) => p >= 1 && pages.add(p));
  const sorted = [...pages].sort((a, b) => a - b);
  const out: (number | "gap")[] = [];
  sorted.forEach((p, i) => {
    if (i > 0 && p - sorted[i - 1] > 1) out.push("gap");
    out.push(p);
  });
  return out;
}

/**
 * "Showing 1–25 of 1,480 items", First / Previous / page numbers / Next / Last and rows
 * per page, all kept in the URL (?page=&limit=) next to the list's own filters.
 */
export function PaginationBar({ total, page, limit, noun }: Props) {
  const pathname = usePathname();
  const params = useSearchParams();
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const last = lastPage(total, limit);
  const href = (p: number, l = limit) => {
    const next = new URLSearchParams(params);
    if (p > 1) next.set("page", String(p));
    else next.delete("page");
    if (l !== DEFAULT_PAGE_SIZE) next.set("limit", String(l));
    else next.delete("limit");
    const qs = next.toString();
    return qs ? `${pathname}?${qs}` : pathname;
  };

  const start = total === 0 ? 0 : (page - 1) * limit + 1;
  const end = Math.min(page * limit, total);
  const word = total === 1 ? noun[0] : noun[1];

  const step = (target: number, label: string, icon: React.ReactNode, disabled: boolean, className = "") =>
    disabled ? (
      <span className={`page-step disabled ${className}`} aria-disabled="true" aria-label={label}>{icon}</span>
    ) : (
      <Link href={href(target)} className={`page-step ${className}`} aria-label={label} scroll={false}>{icon}</Link>
    );

  return (
    <nav className="pagination-bar" aria-label="Pagination">
      <span className="pagination-summary">
        {pending && <Loader2 size={13} className="animate-spin" />}
        Showing <strong>{fmt.format(start)}–{fmt.format(end)}</strong> of <strong>{fmt.format(total)}</strong> {word}
      </span>
      {last > 1 && (
        <div className="pagination-pages">
          {step(1, "First page", <ChevronsLeft size={15} />, page === 1, "page-edge")}
          {step(page - 1, "Previous page", <ChevronLeft size={15} />, page === 1)}
          {pageList(page, last).map((p, i) =>
            p === "gap" ? (
              <span key={`gap-${i}`} className="page-gap" aria-hidden="true">…</span>
            ) : p === page ? (
              <span key={p} className="page-number current" aria-current="page">{p}</span>
            ) : (
              <Link key={p} href={href(p)} className="page-number" scroll={false} aria-label={`Page ${p}`}>{p}</Link>
            ),
          )}
          {step(page + 1, "Next page", <ChevronRight size={15} />, page === last)}
          {step(last, "Last page", <ChevronsRight size={15} />, page === last, "page-edge")}
        </div>
      )}
      <label className="pagination-size">
        <span className="sr-only">Rows per page</span>
        <select
          value={limit}
          onChange={(e) => {
            const nextLimit = Number(e.target.value);
            // Keep the first row in view: row (page-1)*limit+1 lands on this page of the new size.
            const nextPage = Math.floor(((page - 1) * limit) / nextLimit) + 1;
            startTransition(() => router.replace(href(nextPage, nextLimit), { scroll: false }));
          }}
        >
          {PAGE_SIZES.map((n) => (
            <option key={n} value={n}>{n} / page</option>
          ))}
        </select>
      </label>
    </nav>
  );
}
