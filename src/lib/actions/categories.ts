"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { getShopSession } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

// Product categories: admins add, rename and delete (RLS enforces admin-only too).
// tenant_id comes from the database default (current_tenant_id()), never the client.

export type CategoryActionResult = { status: "success"; id: string } | { status: "error"; message: string };

const nameSchema = z
  .string()
  .trim()
  .min(1, "Enter a category name.")
  .max(60, "Category names must be 60 characters or fewer.");
const idSchema = z.uuid();

async function requireAdmin(): Promise<CategoryActionResult | null> {
  const { role } = await getShopSession();
  return role === "admin" ? null : { status: "error", message: "Only shop admins can change categories." };
}

function saveError(error: { code: string; message: string }, name: string): CategoryActionResult {
  switch (error.code) {
    case "23505":
      return { status: "error", message: `There is already a category called “${name}” here.` };
    case "22023":
      return { status: "error", message: "Categories can be at most 4 levels deep." };
    case "23503":
      return { status: "error", message: "The parent category no longer exists. Refresh the page." };
    default:
      console.error("Category save failed:", error);
      return { status: "error", message: "We couldn't save this category. Please try again." };
  }
}

/** Adds a main category (no parent) or a subcategory, placed last among its siblings. */
export async function createCategory(input: { name: string; parentId: string | null }): Promise<CategoryActionResult> {
  const name = nameSchema.safeParse(input.name);
  if (!name.success) return { status: "error", message: name.error.issues[0].message };
  if (input.parentId !== null && !idSchema.safeParse(input.parentId).success) {
    return { status: "error", message: "Invalid parent category." };
  }
  const denied = await requireAdmin();
  if (denied) return denied;

  const supabase = await createClient();
  const siblings = supabase.from("categories").select("sort_order").order("sort_order", { ascending: false }).limit(1);
  const { data: last } = await (input.parentId ? siblings.eq("parent_id", input.parentId) : siblings.is("parent_id", null));

  const { data, error } = await supabase
    .from("categories")
    .insert({ name: name.data, parent_id: input.parentId, sort_order: (last?.[0]?.sort_order ?? 0) + 10 })
    .select("id")
    .single();
  if (error) return saveError(error, name.data);

  refresh();
  return { status: "success", id: data.id };
}

export async function renameCategory(id: string, newName: string): Promise<CategoryActionResult> {
  const name = nameSchema.safeParse(newName);
  if (!name.success) return { status: "error", message: name.error.issues[0].message };
  if (!idSchema.safeParse(id).success) return { status: "error", message: "Invalid category." };
  const denied = await requireAdmin();
  if (denied) return denied;

  const supabase = await createClient();
  const { data, error } = await supabase.from("categories").update({ name: name.data }).eq("id", id).select("id");
  if (error) return saveError(error, name.data);
  if (data.length === 0) return { status: "error", message: "This category no longer exists." };

  refresh();
  return { status: "success", id };
}

/** Only empty categories can go: no items and no subcategories (the foreign keys refuse otherwise). */
export async function deleteCategory(id: string): Promise<CategoryActionResult> {
  if (!idSchema.safeParse(id).success) return { status: "error", message: "Invalid category." };
  const denied = await requireAdmin();
  if (denied) return denied;

  const supabase = await createClient();
  const { data, error } = await supabase.from("categories").delete().eq("id", id).select("id");
  if (error) {
    if (error.code === "23503") {
      return { status: "error", message: "Move its items and delete its subcategories first." };
    }
    console.error("deleteCategory failed:", error);
    return { status: "error", message: "We couldn't delete this category. Please try again." };
  }
  if (data.length === 0) return { status: "error", message: "This category no longer exists." };

  refresh();
  return { status: "success", id };
}
