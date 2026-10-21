"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { audit } from "@/lib/superadmin";
import { resolveTarget, type Target } from "@/lib/target";

// Product categories: admins add, rename and delete (RLS enforces admin-only too).
// tenant_id is the caller's own organization (also the database default), never the client.
// Phase 17: the superadmin console passes `tenantId` to edit any organization's categories (audited).

export type CategoryActionResult = { status: "success"; id: string } | { status: "error"; message: string };

const nameSchema = z
  .string()
  .trim()
  .min(1, "Enter a category name.")
  .max(60, "Category names must be 60 characters or fewer.");
const idSchema = z.uuid();

async function categoryTarget(tenantId?: string) {
  return resolveTarget(tenantId, "Only shop admins can change categories.");
}

async function auditCategory(target: Target, action: string, details: Record<string, string | null>) {
  if (target.adminId) await audit({ adminId: target.adminId, action, tenantId: target.tenantId, details });
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
export async function createCategory(input: { name: string; parentId: string | null }, tenantId?: string): Promise<CategoryActionResult> {
  const name = nameSchema.safeParse(input.name);
  if (!name.success) return { status: "error", message: name.error.issues[0].message };
  if (input.parentId !== null && !idSchema.safeParse(input.parentId).success) {
    return { status: "error", message: "Invalid parent category." };
  }
  const target = await categoryTarget(tenantId);
  if (!target.ok) return { status: "error", message: target.message };
  const supabase = target.client;

  if (input.parentId) {
    const { data: parent } = await supabase.from("categories").select("id").eq("id", input.parentId).eq("tenant_id", target.tenantId).maybeSingle();
    if (!parent) return { status: "error", message: "The parent category no longer exists. Refresh the page." };
  }
  const siblings = supabase
    .from("categories")
    .select("sort_order")
    .eq("tenant_id", target.tenantId)
    .order("sort_order", { ascending: false })
    .limit(1);
  const { data: last } = await (input.parentId ? siblings.eq("parent_id", input.parentId) : siblings.is("parent_id", null));

  const { data, error } = await supabase
    .from("categories")
    // Own organization: the column default (authenticated can't write tenant_id). Console: explicit.
    .insert({
      ...(target.adminId ? { tenant_id: target.tenantId } : {}),
      name: name.data,
      parent_id: input.parentId,
      sort_order: (last?.[0]?.sort_order ?? 0) + 10,
    })
    .select("id")
    .single();
  if (error) return saveError(error, name.data);

  await auditCategory(target, "category.create", { id: data.id, name: name.data, parent_id: input.parentId });
  refresh();
  return { status: "success", id: data.id };
}

export async function renameCategory(id: string, newName: string, tenantId?: string): Promise<CategoryActionResult> {
  const name = nameSchema.safeParse(newName);
  if (!name.success) return { status: "error", message: name.error.issues[0].message };
  if (!idSchema.safeParse(id).success) return { status: "error", message: "Invalid category." };
  const target = await categoryTarget(tenantId);
  if (!target.ok) return { status: "error", message: target.message };

  const { data, error } = await target.client
    .from("categories")
    .update({ name: name.data })
    .eq("id", id)
    .eq("tenant_id", target.tenantId)
    .select("id");
  if (error) return saveError(error, name.data);
  if (data.length === 0) return { status: "error", message: "This category no longer exists." };

  await auditCategory(target, "category.rename", { id, name: name.data });
  refresh();
  return { status: "success", id };
}

/** Only empty categories can go: no items and no subcategories (the foreign keys refuse otherwise). */
export async function deleteCategory(id: string, tenantId?: string): Promise<CategoryActionResult> {
  if (!idSchema.safeParse(id).success) return { status: "error", message: "Invalid category." };
  const target = await categoryTarget(tenantId);
  if (!target.ok) return { status: "error", message: target.message };

  const { data, error } = await target.client.from("categories").delete().eq("id", id).eq("tenant_id", target.tenantId).select("id, name");
  if (error) {
    if (error.code === "23503") {
      return { status: "error", message: "Move its items and delete its subcategories first." };
    }
    console.error("deleteCategory failed:", error);
    return { status: "error", message: "We couldn't delete this category. Please try again." };
  }
  if (data.length === 0) return { status: "error", message: "This category no longer exists." };

  await auditCategory(target, "category.delete", { id, name: data[0].name });
  refresh();
  return { status: "success", id };
}
