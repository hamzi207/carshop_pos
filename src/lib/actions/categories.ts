"use server";

import { refresh } from "next/cache";
import { appOrigin } from "@/lib/account-links";
import { getShopSession } from "@/lib/auth";
import { buildCategoryIndex, fullPath } from "@/lib/categories";
import { getCategories } from "@/lib/category-data";
import { sendTransactionalEmail } from "@/lib/email/send";
import { categoryRequestNotice } from "@/lib/email/templates/categories";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { categoryRequestSchema, type CategoryRequestInput } from "@/lib/validations/category.schema";

// Phase 18: categories are platform data the superadmin manages (src/lib/actions/admin-categories.ts).
// An organization only browses its tree and asks for what's missing.

export type CategoryRequestResult = { status: "success" } | { status: "error"; message: string };

/** Any member can ask for a category; the superadmins get an email and see it in /admin/categories/requests. */
export async function requestCategory(input: CategoryRequestInput): Promise<CategoryRequestResult> {
  const parsed = categoryRequestSchema.safeParse(input);
  if (!parsed.success) return { status: "error", message: parsed.error.issues[0].message };
  const { name, parentId, note } = parsed.data;
  const session = await getShopSession();
  if (session.impersonating) return { status: "error", message: "Login As is read-only. Add the category from the console instead." };

  const index = buildCategoryIndex(await getCategories());
  const existing = index.flat.find((n) => n.name.toLowerCase() === name.toLowerCase() && (n.parent_id ?? null) === parentId);
  if (existing) return { status: "error", message: `“${fullPath(existing)}” already exists.` };
  const parent = parentId ? index.byId.get(parentId) : undefined;
  if (parentId && !parent) return { status: "error", message: "The suggested parent category wasn't found. Refresh the page." };

  const supabase = await createClient();
  const { error } = await supabase.from("category_requests").insert({ name, suggested_parent_id: parentId, note: note || null });
  if (error) {
    if (error.code === "54000") return { status: "error", message: "Your organization has sent 20 requests today. Try again tomorrow." };
    console.error("requestCategory failed:", error);
    return { status: "error", message: "We couldn't send your request. Please try again." };
  }

  // Tell the superadmins; a failed email doesn't undo the request (it's listed in the console either way).
  const { data: supers } = await createAdminClient().from("platform_admins").select("email").is("removed_at", null);
  const content = categoryRequestNotice({
    tenantName: session.tenant.name,
    name,
    parentPath: parent ? fullPath(parent) : null,
    note: note || null,
    requester: `${session.fullName} (${session.email})`,
    url: `${await appOrigin()}/admin/categories/requests`,
  });
  for (const s of supers ?? []) {
    await sendTransactionalEmail({ template: "category_request", to: s.email, content, tenantId: session.tenant.id, sentBy: session.userId });
  }

  refresh();
  return { status: "success" };
}
