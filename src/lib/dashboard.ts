import { z } from "zod";

// Dashboard metric widgets (docs/changes.md §7). Purchases and suppliers are
// left out until the app records purchases.

export const WIDGETS = ["sales", "profit", "pendingInvoices", "pendingQuotations", "counts"] as const;
export type Widget = (typeof WIDGETS)[number];

/** Date range picked next to Customize (kept in the URL: ?range=&from=&to=). */
export const RANGES = ["today", "week", "month", "year", "all", "custom"] as const;
export type RangeKey = (typeof RANGES)[number];
export const DEFAULT_RANGE: RangeKey = "month";
export const RANGE_LABEL: Record<RangeKey, string> = {
  today: "Today",
  week: "This week",
  month: "This month",
  year: "This year",
  all: "All time",
  custom: "Custom dates",
};

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const validDate = (v: unknown) =>
  typeof v === "string" && ISO_DATE.test(v) && !Number.isNaN(Date.parse(`${v}T00:00:00Z`)) ? v : null;

export type DashboardRange = { range: RangeKey; from: string | null; to: string | null };

/** Reads ?range=&from=&to=; anything unknown falls back to this month. */
export function parseDashboardRange(params: Record<string, string | string[] | undefined>): DashboardRange {
  const raw = typeof params.range === "string" ? params.range : "";
  const range = (RANGES as readonly string[]).includes(raw) ? (raw as RangeKey) : DEFAULT_RANGE;
  if (range !== "custom") return { range, from: null, to: null };
  const from = validDate(params.from);
  const to = validDate(params.to);
  return from || to ? { range, from, to } : { range: DEFAULT_RANGE, from: null, to: null };
}

/** How a card shows its figures. Counts can't be a pie (customers vs products isn't a whole). */
export const DISPLAYS = ["numbers", "bar", "pie"] as const;
export type Display = (typeof DISPLAYS)[number];
export const WIDGET_DISPLAYS: Record<Widget, readonly Display[]> = {
  sales: DISPLAYS,
  profit: DISPLAYS,
  pendingInvoices: DISPLAYS,
  pendingQuotations: DISPLAYS,
  counts: ["numbers", "bar"],
};

export const DISPLAY_LABEL: Record<Display, string> = { numbers: "Numbers", bar: "Bar chart", pie: "Pie chart" };

export const WIDGET_LABEL: Record<Widget, string> = {
  sales: "Sales",
  profit: "Profit",
  pendingInvoices: "Pending invoices",
  pendingQuotations: "Pending quotations",
  counts: "Directory counts",
};

export const WIDGET_HINT: Record<Widget, string> = {
  sales: "Invoiced totals, including tax.",
  profit: "Sales excluding tax, minus the cost of parts sold.",
  pendingInvoices: "Invoices from these dates not yet fully paid.",
  pendingQuotations: "Quotations from these dates still open.",
  counts: "Customers and products in total; invoices and quotations in these dates.",
};

/** What each chart form shows, per widget (shown in Customize). */
export const CHART_HINT: Record<Widget, { bar: string; pie?: string }> = {
  sales: { bar: "Sales over the chosen dates (by day, month or year).", pie: "Sales split into profit, cost of parts and tax." },
  profit: { bar: "Profit over the chosen dates (by day, month or year).", pie: "Profit against the cost of parts." },
  pendingInvoices: { bar: "Unpaid balances by age: not yet due, 1–30, 31–60, over 60 days overdue.", pie: "Unpaid balance: overdue vs not yet due." },
  pendingQuotations: { bar: "Open quotations: sent vs accepted.", pie: "Open quotations' value: sent vs accepted." },
  counts: { bar: "Customers, products, invoices and quotations side by side." },
};

/** profiles.dashboard_prefs: which widgets a user sees, and how each card shows. (Older rows also hold "periods"; ignored.) */
export const dashboardPrefsSchema = z.object({
  widgets: z.array(z.enum(WIDGETS)).max(WIDGETS.length),
  display: z.partialRecord(z.enum(WIDGETS), z.enum(DISPLAYS)).default({}),
});
export type DashboardPrefs = { widgets: Widget[]; display: Record<Widget, Display> };

const DEFAULT_DISPLAY: Record<Widget, Display> = {
  sales: "numbers",
  profit: "numbers",
  pendingInvoices: "numbers",
  pendingQuotations: "numbers",
  counts: "numbers",
};

export const DEFAULT_DASHBOARD_PREFS: DashboardPrefs = { widgets: [...WIDGETS], display: DEFAULT_DISPLAY };

/** Stored prefs, or the defaults when unset / unreadable. Keeps the canonical order. */
export function parseDashboardPrefs(value: unknown): DashboardPrefs {
  const parsed = dashboardPrefsSchema.safeParse(value);
  if (!parsed.success) return DEFAULT_DASHBOARD_PREFS;
  const display = { ...DEFAULT_DISPLAY };
  for (const w of WIDGETS) {
    const d = parsed.data.display[w];
    if (d && WIDGET_DISPLAYS[w].includes(d)) display[w] = d;
  }
  return {
    widgets: WIDGETS.filter((w) => parsed.data.widgets.includes(w)),
    display,
  };
}

export type CountAndTotal = { count: number; total: number };

/** public.dashboard_metrics(range, from, to): figures for one date range, in the shop's timezone. */
export type DashboardMetrics = {
  /** The resolved range, as the shop's local dates (YYYY-MM-DD). */
  from: string;
  to: string;
  /** Size of each step in `series`. */
  grain: "day" | "month" | "year";
  sales: number;
  tax: number;
  profit: number;
  invoiceCount: number;
  pendingInvoices: CountAndTotal;
  pendingQuotations: CountAndTotal;
  /** Sales and profit per day / month / year across the range, oldest first. */
  series: { start: string; sales: number; profit: number }[];
  /** Unpaid balances (of invoices in the range) by how overdue they are. */
  aging: { notDue: CountAndTotal; overdue30: CountAndTotal; overdue60: CountAndTotal; overdue60plus: CountAndTotal };
  /** Open, unexpired quotations in the range. */
  quotesByStatus: { sent: CountAndTotal; accepted: CountAndTotal };
  /** Customers and products in total; quotations and invoices in the range. */
  counts: { customers: number; products: number; quotations: number; invoices: number };
};
