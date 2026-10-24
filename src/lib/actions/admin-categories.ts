"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import type { AdminActionResult } from "@/lib/actions/admin";
import { appOrigin } from "@/lib/account-links";
import { getRemapPlan, type RemapRow } from "@/lib/admin-category-data";
import { buildCategoryIndex, CATEGORY_COLUMNS, descendantIds, fullPath, MAX_CATEGORY_DEPTH, type Category } from "@/lib/categories";
import { parseCsv } from "@/lib/csv";
import { sendTransactionalEmail } from "@/lib/email/send";
import { categoryRequestResult } from "@/lib/email/templates/categories";
import { MODULE_KEYS } from "@/lib/modules";
import { audit, changedFields, requireSuperadmin } from "@/lib/superadmin";
import { createAdminClient } from "@/lib/supabase/admin";
import { allRows } from "@/lib/supabase/all-rows";
import { attributeSchema, categoryDetailsSchema, categoryNameSchema, type AttributeInput, type CategoryDetailsInput } from "@/lib/validations/category.schema";

// Phase 18 (deliverables 3–6, 9, 10): the superadmin manages every category. Catalog rows belong to an
// industry, organization-specific rows to one organization. Service role behind requireSuperadmin(), one
// audit row per change. The database checks scope, depth (4 levels), cycles and duplicate names.

type Admin = ReturnType<typeof createAdminClient>;
/** Where a category lives: an industry's catalog or one organization's own categories. */
export type CategoryScope = { industryId: string } | { tenantId: string };

const uuid = z.uuid();
const ok = (message?: string): AdminActionResult => ({ status: "success", message });
const fail = (message: string): AdminActionResult => ({ status: "error", message });

function dbError(error: { code?: string; message: string }, what: string): AdminActionResult {
  switch (error.code) {
    case "23505":
      return fail(error.message.includes("industry catalog") ? error.message : "There is already a category with this name here.");
    case "22023":
      return fail(error.message);
    case "23503":
      return fail(error.message.includes("inventory_items") ? "Items still use this category. Archive it instead." : "That category no longer exists. Refresh the page.");
    default:
      console.error(`${what} failed:`, error);
      return fail(`We couldn't ${what}. Please try again.`);
  }
}

async function getCategory(admin: Admin, id: string) {
  if (!uuid.safeParse(id).success) return null;
  const { data } = await admin.from("categories").select(CATEGORY_COLUMNS).eq("id", id).maybeSingle();
  return data;
}

/** The category's scope as columns, and every category in the same scope (for paths and subtrees). */
async function scopeRows(admin: Admin, c: { industry_id: string | null; tenant_id: string | null }) {
  const rows = await allRows((a, b) =>
    (c.industry_id
      ? admin.from("categories").select(CATEGORY_COLUMNS).eq("industry_id", c.industry_id)
      : admin.from("categories").select(CATEGORY_COLUMNS).eq("tenant_id", c.tenant_id!)
    ).order("id").range(a, b),
  );
  return rows as Category[];
}

const scopeAudit = (c: { industry_id: string | null; tenant_id: string | null }) => ({
  tenantId: c.tenant_id,
  details: (c.industry_id ? { industry_id: c.industry_id } : {}) as Record<string, string>,
});

// ---------------------------------------------------------------------------
// Categories
// ---------------------------------------------------------------------------

/** Adds a category at the end of its siblings: a main category (no parent) or under any category in reach. */
export async function createCategory(scope: CategoryScope, parentId: string | null, rawName: string): Promise<AdminActionResult & { id?: string }> {
  const me = await requireSuperadmin();
  const name = categoryNameSchema.safeParse(rawName);
  if (!name.success) return fail(name.error.issues[0].message);
  const industryId = "industryId" in scope ? scope.industryId : null;
  const tenantId = "tenantId" in scope ? scope.tenantId : null;
  if (!uuid.safeParse(industryId ?? tenantId).success || (parentId !== null && !uuid.safeParse(parentId).success)) return fail("Invalid category.");
  const admin = createAdminClient();

  const siblings = admin.from("categories").select("sort_order").order("sort_order", { ascending: false }).limit(1);
  const scoped = industryId ? siblings.eq("industry_id", industryId) : siblings.eq("tenant_id", tenantId!);
  const { data: last } = await (parentId ? scoped.eq("parent_id", parentId) : scoped.is("parent_id", null));

  const { data, error } = await admin
    .from("categories")
    .insert({ industry_id: industryId, tenant_id: tenantId, parent_id: parentId, name: name.data, sort_order: (last?.[0]?.sort_order ?? 0) + 10, created_by: me.userId })
    .select("id")
    .single();
  if (error) return dbError(error, "add this category");

  await audit({ adminId: me.userId, action: "category.create", tenantId, details: { id: data.id, name: name.data, parent_id: parentId, industry_id: industryId } });
  refresh();
  return { status: "success", id: data.id };
}

/** Name, SKU prefix, icon and colour (prefix and icon matter on main categories: they apply to everything below). */
export async function saveCategoryDetails(id: string, input: CategoryDetailsInput): Promise<AdminActionResult> {
  const me = await requireSuperadmin();
  const parsed = categoryDetailsSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0].message);
  const admin = createAdminClient();
  const before = await getCategory(admin, id);
  if (!before) return fail("That category no longer exists. Refresh the page.");
  const after = {
    name: parsed.data.name,
    sku_prefix: parsed.data.skuPrefix || null,
    icon: parsed.data.icon || null,
    color: parsed.data.color || null,
  };
  const { error } = await admin.from("categories").update(after).eq("id", id);
  if (error) return dbError(error, "save this category");
  const diff = changedFields(before, after);
  if (Object.keys(diff.after).length) {
    const s = scopeAudit(before);
    await audit({ adminId: me.userId, action: before.name !== after.name ? "category.rename" : "category.update", tenantId: s.tenantId, details: { id, ...s.details, ...diff } });
  }
  refresh();
  return ok();
}

/** Moves a category (and everything below it) under another parent in the same tree, or to the top level. */
export async function moveCategory(id: string, parentId: string | null): Promise<AdminActionResult> {
  const me = await requireSuperadmin();
  if (parentId !== null && !uuid.safeParse(parentId).success) return fail("Invalid parent.");
  const admin = createAdminClient();
  const before = await getCategory(admin, id);
  if (!before) return fail("That category no longer exists. Refresh the page.");
  if (before.parent_id === parentId) return ok();
  const { error } = await admin.from("categories").update({ parent_id: parentId, sort_order: Date.now() % 1_000_000_000 }).eq("id", id);
  if (error) return dbError(error, "move this category");
  const s = scopeAudit(before);
  await audit({ adminId: me.userId, action: "category.move", tenantId: s.tenantId, details: { id, name: before.name, ...s.details, before: { parent_id: before.parent_id }, after: { parent_id: parentId } } });
  refresh();
  return ok();
}

/** Swaps a category with the sibling above or below it. */
export async function reorderCategory(id: string, direction: "up" | "down"): Promise<AdminActionResult> {
  await requireSuperadmin();
  const admin = createAdminClient();
  const c = await getCategory(admin, id);
  if (!c) return fail("That category no longer exists. Refresh the page.");
  const siblings = (await scopeRows(admin, c))
    .filter((s) => s.parent_id === c.parent_id)
    .sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name));
  const at = siblings.findIndex((s) => s.id === id);
  const other = siblings[direction === "up" ? at - 1 : at + 1];
  if (!other) return ok();
  // Renumber the siblings 10, 20, 30… with the two swapped, so equal sort orders can't stall the move.
  [siblings[at], siblings[siblings.indexOf(other)]] = [other, siblings[at]];
  for (const [i, s] of siblings.entries()) {
    if (s.sort_order !== (i + 1) * 10) await admin.from("categories").update({ sort_order: (i + 1) * 10 }).eq("id", s.id);
  }
  refresh();
  return ok();
}

/**
 * Archive (hide from pickers; items and documents keep it) or restore a category and everything below it.
 * Archiving never touches items.
 */
export async function setCategoryArchived(id: string, archived: boolean): Promise<AdminActionResult> {
  const me = await requireSuperadmin();
  const admin = createAdminClient();
  const c = await getCategory(admin, id);
  if (!c) return fail("That category no longer exists. Refresh the page.");
  const node = buildCategoryIndex(await scopeRows(admin, c)).byId.get(id);
  if (!node) return fail("That category no longer exists. Refresh the page.");
  const ids = descendantIds(node);
  const { error } = await admin.from("categories").update({ is_archived: archived }).in("id", ids);
  if (error) return dbError(error, archived ? "archive this category" : "restore this category");
  const s = scopeAudit(c);
  await audit({ adminId: me.userId, action: archived ? "category.archive" : "category.restore", tenantId: s.tenantId, details: { id, name: fullPath(node), ...s.details, categories: ids.length } });
  refresh();
  return ok();
}

/** Only unused, empty categories: no items anywhere and no subcategories. Used ones are archived instead. */
export async function deleteCategory(id: string): Promise<AdminActionResult> {
  const me = await requireSuperadmin();
  const admin = createAdminClient();
  const c = await getCategory(admin, id);
  if (!c) return fail("That category no longer exists. Refresh the page.");
  const [{ count: items }, { count: children }] = await Promise.all([
    admin.from("inventory_items").select("id", { count: "exact", head: true }).eq("category_id", id),
    admin.from("categories").select("id", { count: "exact", head: true }).eq("parent_id", id),
  ]);
  if ((items ?? 0) > 0) return fail("Items use this category. Archive it instead.");
  if ((children ?? 0) > 0) return fail("Delete or move its subcategories first.");
  if (c.image_path) await admin.storage.from("category-images").remove([c.image_path]);
  const { error } = await admin.from("categories").delete().eq("id", id);
  if (error) return dbError(error, "delete this category");
  const s = scopeAudit(c);
  await audit({ adminId: me.userId, action: "category.delete", tenantId: s.tenantId, details: { id, name: c.name, ...s.details } });
  refresh();
  return ok();
}

const IMAGE_TYPES: Record<string, string> = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp" };

/** RF-18.2: a category image (PNG, JPG or WebP, at most 1 MB) in the public category-images bucket. */
export async function uploadCategoryImage(id: string, form: FormData): Promise<AdminActionResult> {
  const me = await requireSuperadmin();
  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) return fail("Choose an image.");
  const ext = IMAGE_TYPES[file.type];
  if (!ext) return fail("Use a PNG, JPG or WebP image.");
  if (file.size > 1024 * 1024) return fail("Images can be at most 1 MB.");
  const admin = createAdminClient();
  const c = await getCategory(admin, id);
  if (!c) return fail("That category no longer exists. Refresh the page.");

  const path = `${id}/${Date.now()}.${ext}`;
  const { error: upload } = await admin.storage.from("category-images").upload(path, file, { contentType: file.type, cacheControl: "31536000" });
  if (upload) {
    console.error("category image upload failed:", upload);
    return fail("We couldn't upload this image. Please try again.");
  }
  const { error } = await admin.from("categories").update({ image_path: path }).eq("id", id);
  if (error) {
    await admin.storage.from("category-images").remove([path]);
    return dbError(error, "save this image");
  }
  if (c.image_path) await admin.storage.from("category-images").remove([c.image_path]);
  const s = scopeAudit(c);
  await audit({ adminId: me.userId, action: "category.image", tenantId: s.tenantId, details: { id, name: c.name, ...s.details } });
  refresh();
  return ok();
}

export async function removeCategoryImage(id: string): Promise<AdminActionResult> {
  const me = await requireSuperadmin();
  const admin = createAdminClient();
  const c = await getCategory(admin, id);
  if (!c?.image_path) return ok();
  const { error } = await admin.from("categories").update({ image_path: null }).eq("id", id);
  if (error) return dbError(error, "remove this image");
  await admin.storage.from("category-images").remove([c.image_path]);
  const s = scopeAudit(c);
  await audit({ adminId: me.userId, action: "category.image_remove", tenantId: s.tenantId, details: { id, name: c.name, ...s.details } });
  refresh();
  return ok();
}

// ---------------------------------------------------------------------------
// One organization's tree (deliverable 4)
// ---------------------------------------------------------------------------

/**
 * Hides an industry category (and everything below it) from one organization, or shows it again.
 * Refused while that organization's items use any of them.
 */
export async function setCategoryHidden(tenantId: string, categoryId: string, hidden: boolean): Promise<AdminActionResult> {
  const me = await requireSuperadmin();
  if (!uuid.safeParse(tenantId).success) return fail("Invalid organization.");
  const admin = createAdminClient();
  const c = await getCategory(admin, categoryId);
  if (!c?.industry_id) return fail("Only industry categories can be hidden. Archive or delete the organization's own ones.");
  const node = buildCategoryIndex(await scopeRows(admin, c)).byId.get(categoryId);
  if (!node) return fail("That category no longer exists. Refresh the page.");
  const ids = descendantIds(node);

  if (hidden) {
    const { count } = await admin.from("inventory_items").select("id", { count: "exact", head: true }).eq("tenant_id", tenantId).in("category_id", ids);
    if ((count ?? 0) > 0) return fail(`${count} of this organization's items use “${fullPath(node)}” or a category below it. Move them first.`);
    const { count: own } = await admin.from("categories").select("id", { count: "exact", head: true }).eq("tenant_id", tenantId).in("parent_id", ids);
    if ((own ?? 0) > 0) return fail("The organization has its own categories under this one. Move or delete them first.");
    const { error } = await admin.from("tenant_hidden_categories").upsert(ids.map((id) => ({ tenant_id: tenantId, category_id: id })), { ignoreDuplicates: true });
    if (error) return dbError(error, "hide this category");
  } else {
    // Showing a category shows the branch above it too, so it isn't left orphaned.
    const index = buildCategoryIndex(await scopeRows(admin, c));
    const up: string[] = [];
    let cur = index.byId.get(categoryId);
    while (cur?.parent_id) {
      up.push(cur.parent_id);
      cur = index.byId.get(cur.parent_id);
    }
    const { error } = await admin.from("tenant_hidden_categories").delete().eq("tenant_id", tenantId).in("category_id", [...ids, ...up]);
    if (error) return dbError(error, "show this category");
  }
  await audit({ adminId: me.userId, action: hidden ? "category.hide" : "category.show", tenantId, details: { id: categoryId, name: fullPath(node), categories: ids.length } });
  refresh();
  return ok();
}

// ---------------------------------------------------------------------------
// Whole trees: duplicate, CSV import (deliverable 3, item 8)
// ---------------------------------------------------------------------------

type TreeRow = { id: string; parent_id: string | null; name: string; sort_order: number; sku_prefix: string | null; icon: string | null; color: string | null };

/** Inserts rows level by level (parents first), so every parent exists when its children are checked. */
async function insertLevels(admin: Admin, industryId: string, rows: (TreeRow & { depth: number })[], createdBy: string) {
  for (let depth = 1; depth <= MAX_CATEGORY_DEPTH; depth++) {
    const level = rows.filter((r) => r.depth === depth).map((r) => ({ id: r.id, parent_id: r.parent_id, name: r.name, sort_order: r.sort_order, sku_prefix: r.sku_prefix, icon: r.icon, color: r.color, industry_id: industryId, created_by: createdBy }));
    for (let i = 0; i < level.length; i += 500) {
      const { error } = await admin.from("categories").insert(level.slice(i, i + 500));
      if (error) return error;
    }
  }
  return null;
}

/** Copies another industry's catalog (names, order, prefixes, icons, colours) into an empty catalog. */
export async function duplicateCatalog(fromIndustryId: string, toIndustryId: string): Promise<AdminActionResult> {
  const me = await requireSuperadmin();
  if (!uuid.safeParse(fromIndustryId).success || !uuid.safeParse(toIndustryId).success || fromIndustryId === toIndustryId) return fail("Pick another industry to copy from.");
  const admin = createAdminClient();
  const { count } = await admin.from("categories").select("id", { count: "exact", head: true }).eq("industry_id", toIndustryId);
  if ((count ?? 0) > 0) return fail("This industry already has categories. Duplicate into an empty catalog, or import a CSV to add to it.");
  const source = await allRows((a, b) => admin.from("categories").select(CATEGORY_COLUMNS).eq("industry_id", fromIndustryId).eq("is_archived", false).order("id").range(a, b));
  const index = buildCategoryIndex(source as Category[]);
  const ids = new Map(index.flat.map((n) => [n.id, crypto.randomUUID()]));
  const rows = index.flat
    .filter((n) => !n.archived)
    .map((n) => ({ id: ids.get(n.id)!, parent_id: n.parent_id ? ids.get(n.parent_id)! : null, name: n.name, sort_order: n.sort_order, sku_prefix: n.sku_prefix ?? null, icon: n.icon ?? null, color: n.color ?? null, depth: n.depth }));
  if (!rows.length) return fail("That industry has no categories to copy.");
  const error = await insertLevels(admin, toIndustryId, rows, me.userId);
  if (error) return dbError(error, "copy the categories");
  await audit({ adminId: me.userId, action: "category.duplicate", details: { from_industry_id: fromIndustryId, industry_id: toIndustryId, categories: rows.length } });
  refresh();
  return ok(`${rows.length} categories copied.`);
}

export type ImportRow = { line: number; path: string; status: "new" | "existing" | "problem"; message?: string };
export type ImportResult = { status: "success"; rows: ImportRow[]; created: number } | { status: "error"; message: string };

const SEPARATORS = /\s*(?:›|>|\/)\s*/;

/**
 * CSV import into a catalog: a `path` column ("Beverages › Tea › Green Tea"; › > or / between levels),
 * optional `sku_prefix`, `icon` and `colour` for main categories. Missing parents are created too. With
 * `apply` false it only previews (new / existing / problem per row); nothing is ever renamed or removed.
 */
export async function importCatalogCsv(industryId: string, csv: string, apply: boolean): Promise<ImportResult> {
  const me = await requireSuperadmin();
  if (!uuid.safeParse(industryId).success) return { status: "error", message: "Invalid industry." };
  if (csv.length > 2_000_000) return { status: "error", message: "The file is too large (2 MB at most)." };
  const table = parseCsv(csv.replace(/^﻿/, ""));
  if (table.length < 2) return { status: "error", message: "The file has no rows. The first row must be the header (path, sku_prefix, icon, colour)." };
  const header = table[0].map((h) => h.trim().toLowerCase());
  const col = (name: string) => header.findIndex((h) => h === name || h === name.replace("colour", "color"));
  const pathCol = col("path");
  if (pathCol < 0) return { status: "error", message: "Add a “path” column, e.g. Beverages › Tea › Green Tea." };
  const [prefixCol, iconCol, colorCol] = [col("sku_prefix"), col("icon"), col("colour")];

  const admin = createAdminClient();
  const existing = await allRows((a, b) => admin.from("categories").select(CATEGORY_COLUMNS).eq("industry_id", industryId).order("id").range(a, b));
  const index = buildCategoryIndex(existing as Category[]);
  const byPath = new Map(index.flat.map((n) => [n.path.map((p) => p.toLowerCase()).join("\u0000"), n.id]));
  const lastSort = new Map<string, number>();
  for (const n of index.flat) lastSort.set(n.parent_id ?? "", Math.max(lastSort.get(n.parent_id ?? "") ?? 0, n.sort_order));

  const rows: ImportRow[] = [];
  const toInsert: (TreeRow & { depth: number })[] = [];
  for (const [i, cells] of table.slice(1).entries()) {
    const line = i + 2;
    const raw = (cells[pathCol] ?? "").trim();
    if (!raw) continue;
    const parts = raw.split(SEPARATORS).map((p) => p.trim());
    const path = parts.join(" › ");
    const problem = (message: string) => rows.push({ line, path, status: "problem", message });
    if (parts.length > MAX_CATEGORY_DEPTH) {
      problem("More than 4 levels.");
      continue;
    }
    const bad = parts.find((p) => !categoryNameSchema.safeParse(p).success);
    if (bad !== undefined) {
      problem(bad ? "A name is longer than 60 characters." : "An empty level (two separators in a row).");
      continue;
    }
    const details = categoryDetailsSchema.safeParse({
      name: parts[parts.length - 1],
      skuPrefix: prefixCol >= 0 ? (cells[prefixCol] ?? "") : "",
      icon: iconCol >= 0 ? (cells[iconCol] ?? "").trim().toLowerCase() : "",
      color: colorCol >= 0 ? (cells[colorCol] ?? "").trim().toLowerCase() : "",
    });
    if (!details.success) {
      problem(details.error.issues[0].message);
      continue;
    }
    const key = parts.map((p) => p.toLowerCase()).join("\u0000");
    if (byPath.has(key)) {
      rows.push({ line, path, status: "existing" });
      continue;
    }
    // Create every missing level of the path.
    let parentId: string | null = null;
    for (let d = 1; d <= parts.length; d++) {
      const sub = parts.slice(0, d).map((p) => p.toLowerCase()).join("\u0000");
      let id = byPath.get(sub);
      if (!id) {
        id = crypto.randomUUID();
        const sort = (lastSort.get(parentId ?? "") ?? 0) + 10;
        lastSort.set(parentId ?? "", sort);
        const leaf = d === parts.length;
        toInsert.push({
          id,
          parent_id: parentId,
          name: parts[d - 1],
          sort_order: sort,
          sku_prefix: leaf ? details.data.skuPrefix || null : null,
          icon: leaf ? details.data.icon || null : null,
          color: leaf ? details.data.color || null : null,
          depth: d,
        });
        byPath.set(sub, id);
      }
      parentId = id;
    }
    rows.push({ line, path, status: "new" });
  }
  if (!rows.length) return { status: "error", message: "The file has no category paths." };
  if (!apply) return { status: "success", rows, created: toInsert.length };

  const error = await insertLevels(admin, industryId, toInsert, me.userId);
  if (error) {
    console.error("importCatalogCsv failed:", error);
    return { status: "error", message: "Some categories couldn't be saved (another change may have happened meanwhile). Preview the file again." };
  }
  await audit({ adminId: me.userId, action: "category.import", details: { industry_id: industryId, categories: toInsert.length } });
  refresh();
  return { status: "success", rows, created: toInsert.length };
}

// ---------------------------------------------------------------------------
// Attributes (RF-18.1)
// ---------------------------------------------------------------------------

/** Creates (no `id`) or saves a custom attribute for an industry or one organization. The key can't change. */
export async function saveAttribute(scope: CategoryScope, input: AttributeInput, id?: string): Promise<AdminActionResult> {
  const me = await requireSuperadmin();
  const parsed = attributeSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0].message);
  const a = parsed.data;
  const industryId = "industryId" in scope ? scope.industryId : null;
  const tenantId = "tenantId" in scope ? scope.tenantId : null;
  if (!uuid.safeParse(industryId ?? tenantId).success) return fail("Invalid scope.");
  const admin = createAdminClient();
  const row = {
    label: a.label,
    type: a.type,
    options: a.type === "select" ? a.options : [],
    category_id: a.categoryId,
    is_required: a.isRequired,
    show_on_documents: a.showOnDocuments,
    sort_order: a.sortOrder,
  };
  if (id) {
    if (!uuid.safeParse(id).success) return fail("Invalid attribute.");
    const { data: before } = await admin.from("category_attributes").select("*").eq("id", id).maybeSingle();
    if (!before) return fail("That attribute no longer exists. Refresh the page.");
    // A list attribute can lose options only if no item uses them.
    if (before.type === "select") {
      const removed = before.options.filter((o) => !row.options.includes(o));
      for (const o of removed) {
        const q = admin.from("inventory_items").select("id", { count: "exact", head: true }).eq(`attributes->>${before.key}`, o);
        const { count } = before.tenant_id ? await q.eq("tenant_id", before.tenant_id) : await q;
        if ((count ?? 0) > 0) return fail(`${count} items use the option “${o}”. Change them first, or keep the option.`);
      }
    }
    if (before.type !== row.type) {
      const q = admin.from("inventory_items").select("id", { count: "exact", head: true }).not(`attributes->${before.key}`, "is", null);
      const { count } = before.tenant_id ? await q.eq("tenant_id", before.tenant_id) : await q;
      if ((count ?? 0) > 0) return fail(`${count} items have a value for ${before.label}, so its type can't change. Add a new attribute instead.`);
    }
    const { error } = await admin.from("category_attributes").update(row).eq("id", id);
    if (error) return dbError(error, "save this attribute");
    await audit({ adminId: me.userId, action: "attribute.update", tenantId: before.tenant_id, details: { id, key: before.key, industry_id: before.industry_id, ...changedFields(before, row) } });
  } else {
    const { data, error } = await admin.from("category_attributes").insert({ ...row, key: a.key, industry_id: industryId, tenant_id: tenantId }).select("id").single();
    if (error) {
      if (error.code === "23505") return fail(`The key “${a.key}” is already used. Pick another.`);
      return dbError(error, "add this attribute");
    }
    await audit({ adminId: me.userId, action: "attribute.create", tenantId, details: { id: data.id, key: a.key, label: a.label, industry_id: industryId } });
  }
  refresh();
  return ok();
}

/** Archived attributes leave the product dialog and filters; stored values stay. */
export async function setAttributeArchived(id: string, archived: boolean): Promise<AdminActionResult> {
  const me = await requireSuperadmin();
  if (!uuid.safeParse(id).success) return fail("Invalid attribute.");
  const admin = createAdminClient();
  const { data, error } = await admin.from("category_attributes").update({ is_archived: archived }).eq("id", id).select("key, tenant_id, industry_id").maybeSingle();
  if (error) return dbError(error, archived ? "archive this attribute" : "restore this attribute");
  if (!data) return fail("That attribute no longer exists. Refresh the page.");
  await audit({ adminId: me.userId, action: archived ? "attribute.archive" : "attribute.restore", tenantId: data.tenant_id, details: { id, key: data.key, industry_id: data.industry_id } });
  refresh();
  return ok();
}

/** Deletes an attribute no product has a value for (otherwise archive it, which keeps the values). */
export async function deleteAttribute(id: string): Promise<AdminActionResult> {
  const me = await requireSuperadmin();
  if (!uuid.safeParse(id).success) return fail("Invalid attribute.");
  const admin = createAdminClient();
  const { data: a } = await admin.from("category_attributes").select("*").eq("id", id).maybeSingle();
  if (!a) return fail("That attribute no longer exists. Refresh the page.");
  // Products that could hold it: the organization's, or every organization's in the industry.
  let tenants: string[] = a.tenant_id ? [a.tenant_id] : [];
  if (a.industry_id) {
    const { data } = await admin.from("tenants").select("id").eq("industry_id", a.industry_id);
    tenants = (data ?? []).map((t) => t.id);
  }
  if (tenants.length) {
    const { count } = await admin.from("inventory_items").select("id", { count: "exact", head: true }).in("tenant_id", tenants).not(`attributes->${a.key}`, "is", null);
    if ((count ?? 0) > 0) return fail(`${count} products have a value for ${a.label}. Archive it instead (the values are kept).`);
  }
  const { error } = await admin.from("category_attributes").delete().eq("id", id);
  if (error) return dbError(error, "delete this attribute");
  await audit({ adminId: me.userId, action: "attribute.delete", tenantId: a.tenant_id, details: { id, key: a.key, label: a.label, industry_id: a.industry_id } });
  refresh();
  return ok();
}

// ---------------------------------------------------------------------------
// Category requests (deliverable 5)
// ---------------------------------------------------------------------------

export type RequestDecision =
  | { mode: "tenant" | "industry"; name: string; parentId: string | null; note: string }
  | { mode: "reject"; reason: string };

/**
 * Approves a request as the organization's own category or into its industry's catalog (under any parent
 * in that tree), or rejects it with a reason. The requester gets an email and a notification.
 */
export async function resolveCategoryRequest(id: string, decision: RequestDecision): Promise<AdminActionResult> {
  const me = await requireSuperadmin();
  if (!uuid.safeParse(id).success) return fail("Invalid request.");
  const admin = createAdminClient();
  const { data: req } = await admin.from("category_requests").select("*, tenants(name, industry_id)").eq("id", id).maybeSingle();
  if (!req) return fail("That request no longer exists. Refresh the page.");
  if (req.status !== "pending") return fail("This request was already handled.");
  const industryId = req.tenants?.industry_id;
  if (!industryId) return fail("The organization wasn't found.");

  let createdId: string | null = null;
  let createdPath: string | null = null;
  if (decision.mode === "reject") {
    const reason = decision.reason.trim();
    if (!reason) return fail("Say why, so the organization knows (e.g. use “Others › Gifts” instead).");
    if (reason.length > 500) return fail("Reasons must be 500 characters or fewer.");
  } else {
    const scope: CategoryScope = decision.mode === "industry" ? { industryId } : { tenantId: req.tenant_id };
    const created = await createCategory(scope, decision.parentId, decision.name);
    if (created.status === "error" || !created.id) return created;
    createdId = created.id;
    const tree = await allRows((a, b) => admin.from("categories").select(CATEGORY_COLUMNS).or(`industry_id.eq.${industryId},tenant_id.eq.${req.tenant_id}`).order("id").range(a, b));
    const node = buildCategoryIndex(tree as Category[]).byId.get(createdId);
    createdPath = node ? fullPath(node) : decision.name;
  }

  const status = decision.mode === "reject" ? "rejected" : decision.mode === "industry" ? "approved_industry" : "approved_tenant";
  const { error } = await admin
    .from("category_requests")
    .update({
      status,
      resolved_by: me.userId,
      resolved_at: new Date().toISOString(),
      resolution_note: decision.mode === "reject" ? decision.reason.trim() : decision.note.trim() || null,
      created_category_id: createdId,
    })
    .eq("id", id)
    .eq("status", "pending");
  if (error) return dbError(error, "save this decision");
  await audit({ adminId: me.userId, action: `category_request.${status}`, tenantId: req.tenant_id, details: { id, name: req.name, category_id: createdId } });

  // Tell the requester (a failed email doesn't undo the decision; the notification bell shows it too).
  if (req.requested_by) {
    const { data: who } = await admin.from("profiles").select("full_name, email").eq("id", req.requested_by).maybeSingle();
    if (who) {
      const content = categoryRequestResult({
        fullName: who.full_name,
        name: req.name,
        approved: decision.mode !== "reject",
        path: createdPath,
        reason: decision.mode === "reject" ? decision.reason.trim() : null,
        url: `${await appOrigin()}/settings/categories`,
      });
      await sendTransactionalEmail({ template: "category_request_result", to: who.email, content, tenantId: req.tenant_id, sentBy: me.userId, metadata: { requestId: id } });
    }
  }
  refresh();
  return ok(decision.mode === "reject" ? "The organization has been told why." : `“${createdPath}” added. The organization has been told.`);
}

// ---------------------------------------------------------------------------
// Modules and industry of one organization (deliverables 2 and 6)
// ---------------------------------------------------------------------------

/** Switches optional modules on or off for an organization (its plan can still limit them). */
export async function setTenantModules(tenantId: string, modules: string[]): Promise<AdminActionResult> {
  const me = await requireSuperadmin();
  if (!uuid.safeParse(tenantId).success) return fail("Invalid organization.");
  if (modules.some((m) => !MODULE_KEYS.includes(m))) return fail("Unknown module.");
  const admin = createAdminClient();
  const { data: before } = await admin.from("tenants").select("modules").eq("id", tenantId).maybeSingle();
  if (!before) return fail("That organization wasn't found.");
  const next = [...new Set(modules)].sort();
  const { error } = await admin.from("tenants").update({ modules: next, updated_at: new Date().toISOString() }).eq("id", tenantId);
  if (error) return dbError(error, "save the modules");
  await audit({ adminId: me.userId, action: "tenant.modules", tenantId, details: { before: { modules: before.modules }, after: { modules: next } } });
  refresh();
  return ok();
}

/** Step 1 of changing the industry: which categories need a new home, with suggestions. */
export async function previewIndustryChange(
  tenantId: string,
  industryId: string,
): Promise<{ status: "success"; rows: RemapRow[]; targets: { id: string; path: string; own: boolean }[] } | { status: "error"; message: string }> {
  await requireSuperadmin();
  if (!uuid.safeParse(tenantId).success || !uuid.safeParse(industryId).success) return { status: "error", message: "Invalid organization or industry." };
  try {
    return { status: "success", ...(await getRemapPlan(tenantId, industryId)) };
  } catch (e) {
    console.error("previewIndustryChange failed:", e);
    return { status: "error", message: "We couldn't load the categories. Please try again." };
  }
}

/**
 * Moves an organization to another industry. `mapping` gives a new category for every category its items use
 * that won't survive (see getRemapPlan); the database refuses the change unless every one is mapped.
 */
export async function changeTenantIndustry(tenantId: string, industryId: string, mapping: Record<string, string>): Promise<AdminActionResult> {
  const me = await requireSuperadmin();
  if (!uuid.safeParse(tenantId).success || !uuid.safeParse(industryId).success) return fail("Invalid organization or industry.");
  if (Object.entries(mapping).some(([k, v]) => !uuid.safeParse(k).success || !uuid.safeParse(v).success)) return fail("Map every category to a new one.");
  const admin = createAdminClient();
  const { data: before } = await admin.from("tenants").select("industry_id, industries(name)").eq("id", tenantId).maybeSingle();
  if (!before) return fail("That organization wasn't found.");
  const { data: moved, error } = await admin.rpc("admin_remap_tenant_industry", { p_tenant: tenantId, p_new_industry: industryId, p_mapping: mapping });
  if (error) {
    if (error.code === "22023") return fail(error.message.replace(/\.$/, "") + ". Pick a new category for each one.");
    // Own attribute keys the new industry already has.
    if (error.code === "23505") return fail(error.message);
    return dbError(error, "change the industry");
  }
  const { data: after } = await admin.from("industries").select("name").eq("id", industryId).maybeSingle();
  await audit({
    adminId: me.userId,
    action: "tenant.industry",
    tenantId,
    details: { before: { industry: before.industries?.name ?? before.industry_id }, after: { industry: after?.name ?? industryId }, items_moved: moved ?? 0 },
  });
  refresh();
  return ok(`${moved ?? 0} items moved to new categories.`);
}
