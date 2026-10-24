import type { LucideIcon } from "lucide-react";
import { iconFor } from "@/lib/category-icons";
import type { Tables } from "@/lib/types/database.types";

// Product categories (Phase 18): platform data. Each industry has a catalog (industry_id set) and the
// superadmin can add categories for one organization (tenant_id set). An organization sees its industry's
// catalog minus what was hidden for it, plus its own (RLS). At most 4 levels; an item can sit on any level
// and filtering by a category includes everything below it. Archived categories stay readable (old items
// and documents keep their names) but pickers leave them out.

type Row = Tables<"categories">;

export type Category = Pick<Row, "id" | "name" | "parent_id" | "sort_order"> &
  Partial<Pick<Row, "tenant_id" | "industry_id" | "sku_prefix" | "icon" | "color" | "image_path" | "is_archived">>;

/** Columns every category read selects. */
export const CATEGORY_COLUMNS = "id, name, parent_id, sort_order, tenant_id, industry_id, sku_prefix, icon, color, image_path, is_archived";

export const MAX_CATEGORY_DEPTH = 4;

export type CategoryNode = Category & {
  /** 1 = main category. */
  depth: number;
  /** Names from the main category down to this one. */
  path: string[];
  children: CategoryNode[];
  /** Items in this category and everything below it (when counts were given). */
  itemCount: number;
  /** The main category's icon name and SKU prefix (they follow the main category). */
  mainIcon: string | null;
  mainSkuPrefix: string | null;
  /** Own colour, or the nearest category above with one (RF-18.2). */
  displayColor: string | null;
  /** Archived itself or under an archived category. */
  archived: boolean;
};

export type CategoryIndex = {
  roots: CategoryNode[];
  byId: Map<string, CategoryNode>;
  /** Every category in tree order (parents before children). */
  flat: CategoryNode[];
};

const bySortThenName = (a: Category, b: Category) => a.sort_order - b.sort_order || a.name.localeCompare(b.name);

/** Builds the tree from flat rows. `counts` = items per category id (directly on it). */
export function buildCategoryIndex(categories: Category[], counts: Record<string, number> = {}): CategoryIndex {
  const byId = new Map<string, CategoryNode>();
  for (const c of categories) {
    byId.set(c.id, { ...c, depth: 1, path: [], children: [], itemCount: 0, mainIcon: null, mainSkuPrefix: null, displayColor: null, archived: false });
  }

  const roots: CategoryNode[] = [];
  for (const node of byId.values()) {
    const parent = node.parent_id ? byId.get(node.parent_id) : undefined;
    if (parent) parent.children.push(node);
    else roots.push(node);
  }

  const flat: CategoryNode[] = [];
  const walk = (nodes: CategoryNode[], depth: number, parent: CategoryNode | null): number => {
    nodes.sort(bySortThenName);
    let total = 0;
    for (const node of nodes) {
      node.depth = depth;
      node.path = parent ? [...parent.path, node.name] : [node.name];
      node.mainIcon = parent ? parent.mainIcon : (node.icon ?? null);
      node.mainSkuPrefix = parent ? parent.mainSkuPrefix : (node.sku_prefix ?? null);
      node.displayColor = node.color ?? parent?.displayColor ?? null;
      node.archived = Boolean(node.is_archived) || Boolean(parent?.archived);
      flat.push(node);
      node.itemCount = (counts[node.id] ?? 0) + walk(node.children, depth + 1, node);
      total += node.itemCount;
    }
    return total;
  };
  walk(roots, 1, null);

  return { roots, byId, flat };
}

/** The category and every category below it. */
export function descendantIds(node: CategoryNode): string[] {
  const ids = [node.id];
  for (const child of node.children) ids.push(...descendantIds(child));
  return ids;
}

export const fullPath = (node: CategoryNode) => node.path.join(" › ");

/** Short label for badges: "Main › Leaf" (middle levels left out), or just the main category. */
export function shortPath(node: CategoryNode) {
  return node.path.length > 1 ? `${node.path[0]} › ${node.path[node.path.length - 1]}` : node.path[0];
}

/** The main category's icon (a box when it has none). */
export const categoryIcon = (node: CategoryNode | undefined): LucideIcon => iconFor(node?.mainIcon);

/** "Generate SKU" prefix: the main category's, else the first three letters of its name. */
export function skuPrefix(node: CategoryNode | undefined) {
  if (!node) return "ITM";
  if (node.mainSkuPrefix) return node.mainSkuPrefix;
  return node.path[0].replace(/[^A-Za-z0-9]/g, "").slice(0, 3).toUpperCase() || "ITM";
}

/** Categories a picker offers: not archived (an item's current category is always kept). */
export const pickable = (node: CategoryNode, currentId?: string | null) => !node.archived || node.id === currentId;
