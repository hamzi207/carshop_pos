import { z } from "zod";
import type { CategoryIndex } from "@/lib/categories";
import type { Tables } from "@/lib/types/database.types";

// Custom product attributes (RF-18.1). The superadmin defines them per industry or per organization,
// optionally narrowed to a category (that category and everything below it). Values live in
// inventory_items.attributes keyed by attribute key; private.check_item_attributes() checks them.

export type Attribute = Tables<"category_attributes">;

export type AttrValue = string | number | boolean;

export type AttrValues = Record<string, AttrValue>;

/** What a save sends: keys as the database allows them, values of the three JSON kinds. */
export const attributeValuesSchema = z.record(
  z.string().regex(/^[a-z][a-z0-9_]{0,39}$/),
  z.union([z.string().trim().max(200), z.number(), z.boolean()]),
);

/** Attributes for an item in this category: unscoped ones and ones on the category or anything above it. */
export function applicableAttributes(attributes: Attribute[], index: CategoryIndex, categoryId: string | null | undefined) {
  if (!categoryId) return [];
  const up = new Set<string>();
  for (let n = index.byId.get(categoryId); n; n = n.parent_id ? index.byId.get(n.parent_id) : undefined) up.add(n.id);
  return attributes.filter((a) => !a.is_archived && (!a.category_id || up.has(a.category_id)));
}

/** The values to save: the stored ones (keys of other categories are kept) with the shown fields' edits on top. */
export function mergeAttributeValues(stored: unknown, fields: Attribute[], edited: AttrValues): AttrValues {
  const values: AttrValues = { ...asValues(stored) };
  for (const a of fields) {
    const raw = edited[a.key];
    // A shown yes/no box is always an answer: unticked = No.
    if (a.type === "boolean") values[a.key] = raw === true;
    else if (raw === undefined || raw === "") delete values[a.key];
    else values[a.key] = a.type === "number" ? Number(raw) : raw;
  }
  return values;
}

/** The first problem with the shown fields' values, if any (the database checks again). */
export function attributeProblem(fields: Attribute[], values: AttrValues): string | null {
  for (const a of fields) {
    const v = values[a.key];
    if (a.type === "boolean") continue;
    if (v === undefined || v === "") {
      if (a.is_required) return `${a.label} is required.`;
      continue;
    }
    if (a.type === "number" && !Number.isFinite(Number(v))) return `${a.label} must be a number.`;
    if (a.type === "text" && String(v).length > 200) return `${a.label} must be 200 characters or fewer.`;
  }
  return null;
}

export const asValues = (stored: unknown): AttrValues =>
  stored && typeof stored === "object" && !Array.isArray(stored) ? (stored as AttrValues) : {};

/** "Yes" / "No" for yes/no attributes, the value as text otherwise. */
export const attributeText = (a: Pick<Attribute, "type">, v: AttrValue) =>
  a.type === "boolean" ? (v ? "Yes" : "No") : String(v);

/** "Colour: Red · Size: M" for the attributes flagged "show on documents" (empty when there are none). */
export function documentAttributeLine(attributes: Pick<Attribute, "key" | "label" | "type" | "show_on_documents" | "is_archived" | "sort_order">[], stored: unknown) {
  const values = asValues(stored);
  return attributes
    .filter((a) => a.show_on_documents && !a.is_archived && values[a.key] !== undefined && values[a.key] !== "")
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((a) => `${a.label}: ${attributeText(a, values[a.key])}`)
    .join(" · ");
}
