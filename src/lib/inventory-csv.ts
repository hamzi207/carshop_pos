// Inventory CSV (Phase 15): the columns, reading a file into rows, and the Vehicles cell format.
// Shared by the import dialog (browser) and src/lib/actions/inventory-csv.ts (server).
import { parseCsv } from "@/lib/csv";

export const CSV_COLUMNS = [
  { key: "sku", label: "SKU", aliases: ["partcode", "code", "partno", "partnumber"] },
  { key: "name", label: "Name", aliases: ["productname", "product", "itemname"] },
  { key: "category", label: "Category", aliases: ["categorypath"] },
  { key: "costPrice", label: "Cost Price", aliases: ["cost"] },
  { key: "sellingPrice", label: "Sale Price", aliases: ["sellingprice", "price", "saleprice"] },
  { key: "stock", label: "Stock", aliases: ["quantity", "qty", "stockonhand", "onhand"] },
  { key: "universal", label: "Universal", aliases: ["universalfit"] },
  { key: "vehicles", label: "Vehicles", aliases: ["fitment", "compatiblevehicles"] },
  { key: "vendor", label: "Vendor", aliases: ["vendorname", "supplier"] },
  { key: "lowStock", label: "Low Stock Alert", aliases: ["lowstock", "lowstockthreshold", "reorderlevel"] },
  { key: "priceIncludesTax", label: "Price Includes Tax", aliases: ["includestax", "inctax"] },
  { key: "description", label: "Description", aliases: ["notes"] },
] as const;

export type CsvColumnKey = (typeof CSV_COLUMNS)[number]["key"];
export const CSV_COLUMN_LABEL = Object.fromEntries(CSV_COLUMNS.map((c) => [c.key, c.label])) as Record<CsvColumnKey, string>;

/** One data line of the file. A key is missing when the file has no such column. */
export type CsvItemRow = { line: number; cells: Partial<Record<CsvColumnKey, string>> };

export const MAX_IMPORT_ROWS = 1000;
/** Rows saved per server call, so the dialog can show progress. */
export const IMPORT_BATCH = 100;

const normalizeHeader = (h: string) => h.toLowerCase().replace(/[^a-z0-9]/g, "");

/** Reads the file's text: matches headers by name (any order, common synonyms), then the rows. */
export function readInventoryCsv(text: string): { rows: CsvItemRow[]; columns: CsvColumnKey[]; error?: string } {
  const table = parseCsv(text);
  if (table.length === 0) return { rows: [], columns: [], error: "The file is empty." };
  const [header, ...data] = table;
  const map = new Map<number, CsvColumnKey>();
  header.forEach((h, i) => {
    const n = normalizeHeader(h);
    const col = CSV_COLUMNS.find((c) => normalizeHeader(c.label) === n || (c.aliases as readonly string[]).includes(n));
    if (col && ![...map.values()].includes(col.key)) map.set(i, col.key);
  });
  const columns = [...map.values()];
  const missing = (["sku", "name", "category", "sellingPrice"] as const).filter((k) => !columns.includes(k));
  if (missing.length) {
    return {
      rows: [],
      columns,
      error: `The first row must name the columns. Missing: ${missing.map((k) => CSV_COLUMN_LABEL[k]).join(", ")}. Download the template to see the layout.`,
    };
  }
  if (data.length === 0) return { rows: [], columns, error: "The file has a header row but no items." };
  if (data.length > MAX_IMPORT_ROWS) {
    return { rows: [], columns, error: `The file has ${data.length} items. Import up to ${MAX_IMPORT_ROWS} at a time (split the file).` };
  }
  const rows = data.map((r, i) => {
    const cells: Partial<Record<CsvColumnKey, string>> = {};
    for (const [index, key] of map) cells[key] = (r[index] ?? "").trim();
    // Line numbers as a spreadsheet shows them: the header is line 1.
    return { line: i + 2, cells };
  });
  return { rows, columns };
}

/** "Rs. 1,250.50" → 1250.5; blank → null; not a number → NaN. */
export function parseNumberCell(v: string | undefined): number | null {
  const s = (v ?? "").replace(/rs\.?|pkr|,|\s/gi, "");
  if (s === "") return null;
  return /^-?\d+(\.\d+)?$/.test(s) ? Number(s) : NaN;
}

/** Yes / No / true / false / 1 / 0 / Y / N; blank → null; anything else → undefined (an error). */
export function parseYesNo(v: string | undefined): boolean | null | undefined {
  const s = (v ?? "").trim().toLowerCase();
  if (s === "") return null;
  if (["yes", "y", "true", "1"].includes(s)) return true;
  if (["no", "n", "false", "0"].includes(s)) return false;
  return undefined;
}

export type VehicleSpec = { label: string; from: number; to: number; text: string };

/**
 * "2018-2022 SUZUKI Alto; 2020 Honda Civic" → specs. Each entry is a year or year range, then the
 * make and model exactly as in the vehicle list (any capitals). Returns the entries it couldn't read too.
 */
export function parseVehiclesCell(v: string | undefined): { specs: VehicleSpec[]; invalid: string[] } {
  const specs: VehicleSpec[] = [];
  const invalid: string[] = [];
  for (const part of (v ?? "").split(/[;\n|]+/)) {
    const text = part.trim();
    if (!text) continue;
    const m = /^(\d{4})(?:\s*[-–]\s*(\d{4}))?\s+(.+)$/.exec(text);
    const from = m ? Number(m[1]) : NaN;
    const to = m ? Number(m[2] ?? m[1]) : NaN;
    if (!m || from < 1960 || to > 2100 || to < from || to - from > 70) {
      invalid.push(text);
      continue;
    }
    specs.push({ label: m[3].replace(/\s+/g, " ").toLowerCase(), from, to, text });
  }
  return { specs, invalid };
}

/** Linked vehicles → "2018-2022 SUZUKI Alto; 2015 SUZUKI Alto" (consecutive years become ranges). */
export function formatVehiclesCell(vehicles: { year: number; make: string; model: string }[]) {
  const groups = new Map<string, number[]>();
  for (const v of vehicles) {
    const key = `${v.make} ${v.model}`;
    groups.set(key, [...(groups.get(key) ?? []), v.year]);
  }
  const parts: string[] = [];
  for (const [name, years] of [...groups].sort(([a], [b]) => a.localeCompare(b))) {
    const sorted = [...new Set(years)].sort((a, b) => a - b);
    let start = sorted[0];
    for (let i = 1; i <= sorted.length; i++) {
      if (sorted[i] !== sorted[i - 1] + 1) {
        const end = sorted[i - 1];
        parts.push(`${start === end ? start : `${start}-${end}`} ${name}`);
        start = sorted[i];
      }
    }
  }
  return parts.join("; ");
}

/** "Exterior > Wrapping / PPF" → "exterior › wrapping › ppf", for matching category paths. */
export const normalizeCategoryPath = (path: string) =>
  path
    .split(/\s*(?:›|>|\/|\\)\s*/)
    .map((p) => p.trim().toLowerCase())
    .filter(Boolean)
    .join(" › ");

/** The template's header and two example rows. */
export const TEMPLATE_ROWS: string[][] = [
  CSV_COLUMNS.map((c) => c.label),
  ["PPF-CLR-001", "Clear PPF roll (1.5m x 15m)", "Exterior › Wrapping › PPF", "38000", "52000", "4", "Yes", "", "Lahore Wraps", "2", "Yes", "Self-healing clear film"],
  ["MAT-ALT-018", "Floor mats (Alto 2019+)", "Interior › Floor Mats", "2500", "4200", "12", "No", "2019-2026 SUZUKI Alto", "", "5", "", ""],
];
