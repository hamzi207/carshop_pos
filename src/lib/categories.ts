import {
  Archive,
  Armchair,
  Box,
  Car,
  Cpu,
  Disc3,
  Droplet,
  Gauge,
  Lightbulb,
  ShieldCheck,
  Speaker,
  SprayCan,
  Wrench,
  Zap,
  type LucideIcon,
} from "lucide-react";
import type { Tables } from "@/lib/types/database.types";

// Product categories (docs/categories.md): a per-shop tree, at most 4 levels
// (Exterior › Wrapping › Wrapping Tools › Heat Gun). An item can sit on any level;
// filtering by a category includes everything below it.

export type Category = Pick<Tables<"categories">, "id" | "name" | "parent_id" | "sort_order">;

export const MAX_CATEGORY_DEPTH = 4;

export type CategoryNode = Category & {
  /** 1 = main category. */
  depth: number;
  /** Names from the main category down to this one. */
  path: string[];
  children: CategoryNode[];
  /** Items in this category and everything below it (when counts were given). */
  itemCount: number;
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
  for (const c of categories) byId.set(c.id, { ...c, depth: 1, path: [], children: [], itemCount: 0 });

  const roots: CategoryNode[] = [];
  for (const node of byId.values()) {
    const parent = node.parent_id ? byId.get(node.parent_id) : undefined;
    if (parent) parent.children.push(node);
    else roots.push(node);
  }

  const flat: CategoryNode[] = [];
  const walk = (nodes: CategoryNode[], depth: number, parentPath: string[]): number => {
    nodes.sort(bySortThenName);
    let total = 0;
    for (const node of nodes) {
      node.depth = depth;
      node.path = [...parentPath, node.name];
      flat.push(node);
      node.itemCount = (counts[node.id] ?? 0) + walk(node.children, depth + 1, node.path);
      total += node.itemCount;
    }
    return total;
  };
  walk(roots, 1, []);

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

// Icons and SKU prefixes follow the main category. Main categories added later
// fall back to a box icon and the first three letters of their name.
const GROUP_ICON: Record<string, LucideIcon> = {
  Interior: Armchair,
  Exterior: Car,
  Performance: Gauge,
  Electrical: Zap,
  "Cleaning & Detailing": SprayCan,
  Audio: Speaker,
  Electronics: Cpu,
  Security: ShieldCheck,
  Lighting: Lightbulb,
  "Wheels & Tires": Disc3,
  "Tools & Equipment": Wrench,
  "Oils & Fluids": Droplet,
  Storage: Archive,
};

const GROUP_SKU_PREFIX: Record<string, string> = {
  Interior: "INT",
  Exterior: "EXT",
  Performance: "PRF",
  Electrical: "ELC",
  "Cleaning & Detailing": "CLN",
  Audio: "AUD",
  Electronics: "ELX",
  Security: "SEC",
  Lighting: "LGT",
  "Wheels & Tires": "WHL",
  "Tools & Equipment": "TLS",
  "Oils & Fluids": "OIL",
  Storage: "STO",
  Others: "OTH",
};

export const categoryIcon = (node: CategoryNode | undefined): LucideIcon =>
  (node && GROUP_ICON[node.path[0]]) || Box;

export function skuPrefix(node: CategoryNode | undefined) {
  if (!node) return "ITM";
  const main = node.path[0];
  return GROUP_SKU_PREFIX[main] ?? (main.replace(/[^A-Za-z0-9]/g, "").slice(0, 3).toUpperCase() || "ITM");
}
