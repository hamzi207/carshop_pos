"use server";

import { refresh } from "next/cache";
import { getShopSession } from "@/lib/auth";
import { buildCategoryIndex, fullPath } from "@/lib/categories";
import { getCategories } from "@/lib/category-data";
import {
  CSV_COLUMN_LABEL,
  CSV_COLUMNS,
  formatVehiclesCell,
  IMPORT_BATCH,
  MAX_IMPORT_ROWS,
  normalizeCategoryPath,
  parseNumberCell,
  parseVehiclesCell,
  parseYesNo,
  type CsvColumnKey,
  type CsvItemRow,
} from "@/lib/inventory-csv";
import { createClient } from "@/lib/supabase/server";
import { inventoryItemSchema, type InventoryItemInput } from "@/lib/validations/inventory.schema";

// Inventory CSV import / export (Phase 15). Every query runs with the caller's session (RLS: their
// own shop); rows are saved one by one through save_inventory_item, the same function as the
// part dialog, so the same rules apply (SKU unique per shop, stock can't go below reservations).

type Supabase = Awaited<ReturnType<typeof createClient>>;

export type CsvRowCheck = {
  line: number;
  sku: string;
  name: string;
  /** new = will be added · update = replaces the item with this SKU · error = skipped. */
  action: "new" | "update" | "error";
  errors: { column: string; message: string }[];
};

export type CsvImportResult = { line: number; sku: string; status: "created" | "updated" | "error"; message?: string };

type Existing = {
  id: string;
  sku: string;
  name: string;
  description: string | null;
  vendor_name: string | null;
  category_id: string;
  cost_price: number;
  selling_price: number;
  quantity_on_hand: number;
  low_stock_threshold: number;
  is_universal: boolean;
  price_includes_tax: boolean;
  item_vehicle_compatibility: { vehicle_id: number }[];
};

const chunks = <T,>(list: T[], size: number) => Array.from({ length: Math.ceil(list.length / size) }, (_, i) => list.slice(i * size, i * size + size));

/** Items already in the shop with these SKUs (upper-cased). */
async function existingBySku(supabase: Supabase, skus: string[]) {
  const map = new Map<string, Existing>();
  for (const part of chunks([...new Set(skus)].filter(Boolean), 200)) {
    const { data, error } = await supabase
      .from("inventory_items")
      .select("id, sku, name, description, vendor_name, category_id, cost_price, selling_price, quantity_on_hand, low_stock_threshold, is_universal, price_includes_tax, item_vehicle_compatibility(vehicle_id)")
      .in("sku", part);
    if (error) throw new Error("Could not check existing SKUs.");
    for (const item of data as Existing[]) map.set(item.sku, item);
  }
  return map;
}

/** Vehicles cell entries → vehicle ids (match_vehicles), keyed by the entry's normalised text. */
async function resolveVehicles(supabase: Supabase, cells: (string | undefined)[]) {
  const unique = new Map<string, { label: string; from: number; to: number }>();
  for (const cell of cells) for (const s of parseVehiclesCell(cell).specs) unique.set(`${s.from}-${s.to} ${s.label}`, s);
  const keys = [...unique.keys()];
  const ids = new Map<string, number[]>(keys.map((k) => [k, []]));
  for (const part of chunks(keys, 2000)) {
    const { data, error } = await supabase.rpc("match_vehicles", { p_specs: part.map((k) => unique.get(k)!) });
    if (error) throw new Error("Could not look up the vehicles.");
    for (const m of data) ids.get(part[m.spec_index])!.push(m.vehicle_id);
  }
  return ids;
}

type Prepared = { check: CsvRowCheck; input?: InventoryItemInput; existingId?: string };

/** Validates every row against the shop (categories, SKUs, vehicles) and builds what would be saved. */
async function prepare(rows: CsvItemRow[], updateExisting: boolean): Promise<Prepared[]> {
  const supabase = await createClient();
  const [{ tenant }, categories] = await Promise.all([getShopSession(), getCategories()]);
  const index = buildCategoryIndex(categories);
  const byPath = new Map(index.flat.map((n) => [normalizeCategoryPath(fullPath(n)), n.id]));
  // A category's own name works too when only one category has it ("PPF").
  const byName = new Map<string, string | null>();
  for (const n of index.flat) {
    const k = n.name.trim().toLowerCase();
    byName.set(k, byName.has(k) ? null : n.id);
  }
  const skuOf = (r: CsvItemRow) => (r.cells.sku ?? "").trim().toUpperCase();
  const [existing, vehicleIds] = await Promise.all([
    existingBySku(supabase, rows.map(skuOf)),
    resolveVehicles(supabase, rows.map((r) => r.cells.vehicles)),
  ]);

  const seen = new Map<string, number>();
  return rows.map((row) => {
    const c = row.cells;
    const sku = skuOf(row);
    const errors: CsvRowCheck["errors"] = [];
    const err = (column: CsvColumnKey | "row", message: string) =>
      errors.push({ column: column === "row" ? "" : CSV_COLUMN_LABEL[column], message });
    const has = (k: CsvColumnKey) => c[k] !== undefined && c[k] !== "";
    const current = sku ? existing.get(sku) : undefined;
    const update = Boolean(current && updateExisting);

    if (sku && seen.has(sku)) err("sku", `SKU ${sku} is already on line ${seen.get(sku)} of this file.`);
    else if (sku) seen.set(sku, row.line);
    if (current && !updateExisting) err("sku", `SKU ${sku} is already in your inventory. Tick "Update items with the same SKU" to change it.`);

    // Category
    let categoryId = current && update && !has("category") ? current.category_id : "";
    if (has("category")) {
      const path = normalizeCategoryPath(c.category!);
      categoryId = byPath.get(path) ?? byName.get(path) ?? "";
      if (!categoryId) err("category", `No category "${c.category}". Use the full path, e.g. Exterior › Wrapping › PPF.`);
    } else if (!update) err("category", "Enter a category.");

    // Numbers: blank keeps the current value on updates; new items get the defaults.
    const num = (k: CsvColumnKey, fallback: number, required = false) => {
      const v = parseNumberCell(c[k]);
      if (v === null) {
        if (required && !update) err(k, `Enter a ${CSV_COLUMN_LABEL[k].toLowerCase()}.`);
        return fallback;
      }
      if (Number.isNaN(v)) {
        err(k, `"${c[k]}" isn't a number.`);
        return fallback;
      }
      return v;
    };
    const costPrice = num("costPrice", current && update ? Number(current.cost_price) : 0);
    const sellingPrice = num("sellingPrice", current && update ? Number(current.selling_price) : 0, true);
    const quantityOnHand = num("stock", current && update ? current.quantity_on_hand : 0);
    const lowStockThreshold = num("lowStock", current && update ? current.low_stock_threshold : 5);

    const yesNo = (k: CsvColumnKey, fallback: boolean | null) => {
      const v = parseYesNo(c[k]);
      if (v === undefined) {
        err(k, `Use Yes or No (not "${c[k]}").`);
        return fallback;
      }
      return v ?? fallback;
    };
    const priceIncludesTax = yesNo("priceIncludesTax", current && update ? current.price_includes_tax : tenant.pricesIncludeTax) ?? tenant.pricesIncludeTax;

    // Fitment: Universal Yes, or the listed vehicles. Blank on an update keeps the current fitment.
    const { specs, invalid } = parseVehiclesCell(c.vehicles);
    for (const text of invalid) err("vehicles", `Can't read "${text}". Write it as a year or years, then make and model: 2018-2022 SUZUKI Alto.`);
    const ids = new Set<number>();
    for (const s of specs) {
      const found = vehicleIds.get(`${s.from}-${s.to} ${s.label}`) ?? [];
      if (found.length === 0) err("vehicles", `No vehicle "${s.text}" in the vehicle list.`);
      for (const id of found) ids.add(id);
    }
    const listed = specs.length > 0 || invalid.length > 0;
    let isUniversal = yesNo("universal", null);
    if (isUniversal === null) isUniversal = current && update && !listed ? current.is_universal : !listed;
    let vehicles = [...ids];
    if (!listed && current && update && !isUniversal) vehicles = current.item_vehicle_compatibility.map((v) => v.vehicle_id);
    if (isUniversal && listed) err("vehicles", "Universal products fit every vehicle: leave Vehicles empty, or set Universal to No.");

    const text = (k: CsvColumnKey, existingValue: string | null | undefined) => (c[k] !== undefined && (c[k] !== "" || !update) ? c[k]! : (existingValue ?? ""));
    const candidate = {
      sku,
      name: text("name", current?.name),
      description: text("description", current?.description),
      vendorName: text("vendor", current?.vendor_name),
      categoryId,
      costPrice,
      sellingPrice,
      quantityOnHand,
      lowStockThreshold,
      priceIncludesTax,
      isUniversal,
      vehicleIds: isUniversal ? [] : vehicles,
    };

    let input: InventoryItemInput | undefined;
    if (errors.length === 0) {
      const parsed = inventoryItemSchema.safeParse(candidate);
      if (parsed.success) input = parsed.data;
      else {
        const column: Partial<Record<string, CsvColumnKey>> = {
          sku: "sku", name: "name", description: "description", vendorName: "vendor", categoryId: "category",
          costPrice: "costPrice", sellingPrice: "sellingPrice", quantityOnHand: "stock", lowStockThreshold: "lowStock", vehicleIds: "vehicles",
        };
        for (const issue of parsed.error.issues) {
          const key = column[String(issue.path[0])];
          const message = key === "vehicles" ? "Vehicle-specific products need at least one vehicle in Vehicles (or set Universal to Yes)." : issue.message;
          if (key) err(key, message);
          else err("row", message);
        }
      }
    }

    return {
      check: { line: row.line, sku, name: candidate.name, action: errors.length ? "error" : update ? "update" : "new", errors },
      input,
      existingId: update ? current?.id : undefined,
    };
  });
}

/** Import dialog, step 2: what each row would do, with every problem found. Nothing is saved. */
export async function checkInventoryCsv(rows: CsvItemRow[], updateExisting: boolean): Promise<{ status: "success"; rows: CsvRowCheck[] } | { status: "error"; message: string }> {
  if (!Array.isArray(rows) || rows.length === 0) return { status: "error", message: "The file has no items." };
  if (rows.length > MAX_IMPORT_ROWS) return { status: "error", message: `Import up to ${MAX_IMPORT_ROWS} items at a time.` };
  try {
    return { status: "success", rows: (await prepare(rows, updateExisting)).map((p) => p.check) };
  } catch (e) {
    console.error("checkInventoryCsv failed:", e);
    return { status: "error", message: "We couldn't check the file. Please try again." };
  }
}

/** Step 3: saves one batch of rows (≤ 100); rows with problems are skipped and reported. */
export async function importInventoryCsv(rows: CsvItemRow[], updateExisting: boolean): Promise<{ status: "success"; results: CsvImportResult[] } | { status: "error"; message: string }> {
  if (!Array.isArray(rows) || rows.length === 0 || rows.length > IMPORT_BATCH) return { status: "error", message: "Send up to 100 items at a time." };
  let prepared: Prepared[];
  try {
    prepared = await prepare(rows, updateExisting);
  } catch (e) {
    console.error("importInventoryCsv failed:", e);
    return { status: "error", message: "We couldn't read these rows. Please try again." };
  }
  const supabase = await createClient();
  const results: CsvImportResult[] = [];
  for (const p of prepared) {
    const { line, sku } = p.check;
    if (!p.input) {
      results.push({ line, sku, status: "error", message: p.check.errors.map((e) => e.message).join(" ") });
      continue;
    }
    const item = p.input;
    const { error } = await supabase.rpc("save_inventory_item", {
      p_item_id: p.existingId,
      p_sku: item.sku,
      p_name: item.name,
      p_description: item.description || undefined,
      p_category_id: item.categoryId,
      p_cost_price: item.costPrice,
      p_selling_price: item.sellingPrice,
      p_quantity_on_hand: item.quantityOnHand,
      p_low_stock_threshold: item.lowStockThreshold,
      p_is_universal: item.isUniversal,
      p_price_includes_tax: item.priceIncludesTax,
      p_vendor_name: item.vendorName || undefined,
      p_vehicle_ids: item.isUniversal ? [] : item.vehicleIds,
    });
    if (error) {
      const message =
        error.code === "23505"
          ? `SKU ${sku} is already used by another item.`
          : error.code === "23514" && error.message.includes("inventory_reserved_within_stock")
            ? "Stock can't go below what open quotations have reserved."
            : "This row couldn't be saved.";
      if (!["23505", "23514"].includes(error.code)) console.error("importInventoryCsv row failed:", error.message);
      results.push({ line, sku, status: "error", message });
    } else results.push({ line, sku, status: p.existingId ? "updated" : "created" });
  }
  if (results.some((r) => r.status !== "error")) refresh();
  return { status: "success", results };
}

/** "Export Inventory (CSV)": every item in the shop (all pages), in the import template's columns. */
export async function exportInventoryCsv(): Promise<{ status: "success"; header: string[]; rows: (string | number)[][] } | { status: "error"; message: string }> {
  const supabase = await createClient();
  const index = buildCategoryIndex(await getCategories());
  type Row = Omit<Existing, "item_vehicle_compatibility"> & { item_vehicle_compatibility: { vehicles: { year: number; make: string; model: string } | null }[] };
  const all: Row[] = [];
  // PostgREST returns at most 1000 rows per request: page through everything.
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase
      .from("inventory_items")
      .select("id, sku, name, description, vendor_name, category_id, cost_price, selling_price, quantity_on_hand, low_stock_threshold, is_universal, price_includes_tax, item_vehicle_compatibility(vehicles(year, make, model))")
      .order("name")
      .order("id")
      .range(from, from + 999)
      .overrideTypes<Row[], { merge: false }>();
    if (error) {
      console.error("exportInventoryCsv failed:", error.message);
      return { status: "error", message: "We couldn't export the inventory. Please try again." };
    }
    all.push(...data);
    if (data.length < 1000) break;
  }
  const yes = (b: boolean) => (b ? "Yes" : "No");
  return {
    status: "success",
    header: CSV_COLUMNS.map((c) => c.label),
    rows: all.map((i) => {
      const node = index.byId.get(i.category_id);
      return [
        i.sku,
        i.name,
        node ? fullPath(node) : "",
        Number(i.cost_price),
        Number(i.selling_price),
        i.quantity_on_hand,
        yes(i.is_universal),
        i.is_universal ? "" : formatVehiclesCell(i.item_vehicle_compatibility.flatMap((l) => (l.vehicles ? [l.vehicles] : []))),
        i.vendor_name ?? "",
        i.low_stock_threshold,
        yes(i.price_includes_tax),
        i.description ?? "",
      ];
    }),
  };
}
