import type { CSSProperties } from "react";

// RF-18.2: category colours. The keys match the categories.color check constraint. Each is a mid-tone
// that reads on light and dark backgrounds; chips tint their background from it (see .cat-color in globals.css).
export const CATEGORY_COLORS = {
  slate: "#64748b",
  red: "#ef4444",
  orange: "#f97316",
  amber: "#f59e0b",
  yellow: "#eab308",
  lime: "#84cc16",
  green: "#22c55e",
  emerald: "#10b981",
  teal: "#14b8a6",
  cyan: "#06b6d4",
  sky: "#0ea5e9",
  blue: "#3b82f6",
  indigo: "#6366f1",
  violet: "#8b5cf6",
  purple: "#a855f7",
  fuchsia: "#d946ef",
  pink: "#ec4899",
  rose: "#f43f5e",
} as const;

export type CategoryColor = keyof typeof CATEGORY_COLORS;

export const COLOR_KEYS = Object.keys(CATEGORY_COLORS) as CategoryColor[];

export const isCategoryColor = (value: unknown): value is CategoryColor =>
  typeof value === "string" && value in CATEGORY_COLORS;

/** Inline style that sets --cat-color for .cat-color elements (nothing when the category has no colour). */
export const colorStyle = (color: string | null | undefined): CSSProperties | undefined =>
  isCategoryColor(color) ? ({ "--cat-color": CATEGORY_COLORS[color] } as CSSProperties) : undefined;

/** Public URL of a category image in the category-images bucket. */
export const categoryImageUrl = (path: string | null | undefined) =>
  path ? `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/category-images/${path}` : null;
