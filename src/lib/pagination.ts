import { z } from "zod";

// Server-side pagination for the list pages (?page=&limit=). Lists are paged in SQL
// with exact counts; filters stay in the URL next to page/limit.

export const PAGE_SIZES = [25, 50, 100] as const;
export const DEFAULT_PAGE_SIZE = 25;

export type Pagination = { page: number; limit: number };

/** One page of rows plus the total that matches the filters. */
export type Paged<T> = { rows: T[]; total: number } & Pagination;

const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).max(100_000).catch(1),
  limit: z.coerce
    .number()
    .int()
    .refine((n) => (PAGE_SIZES as readonly number[]).includes(n))
    .catch(DEFAULT_PAGE_SIZE),
});

/** Invalid or missing values fall back to page 1, 25 per page. */
export function parsePagination(raw: { page?: string; limit?: string }): Pagination {
  return paginationSchema.parse({ page: raw.page ?? 1, limit: raw.limit ?? DEFAULT_PAGE_SIZE });
}

/** Inclusive row range for PostgREST's .range(from, to). */
export function pageRange({ page, limit }: Pagination) {
  const from = (page - 1) * limit;
  return { from, to: from + limit - 1 };
}

export const lastPage = (total: number, limit: number) => Math.max(1, Math.ceil(total / limit));

/** PostgREST answers 416 / PGRST103 when the range starts past the last row. */
export const isRangePastEnd = (error: { code?: string } | null) => error?.code === "PGRST103";

/**
 * Where to send a request for a page past the end (e.g. after deleting the last row
 * on the last page, or a stale link): the same URL on the last page, or null when the
 * requested page is fine.
 */
export function pastEndRedirect(
  path: string,
  raw: Record<string, string | string[] | undefined>,
  result: Paged<unknown>,
): string | null {
  if (result.rows.length > 0 || result.total === 0 || result.page === 1) return null;
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(raw)) {
    const v = Array.isArray(value) ? value[0] : value;
    if (v) params.set(key, v);
  }
  const last = lastPage(result.total, result.limit);
  if (last === 1) params.delete("page");
  else params.set("page", String(last));
  const qs = params.toString();
  return qs ? `${path}?${qs}` : path;
}
