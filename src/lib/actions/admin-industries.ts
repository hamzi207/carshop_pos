"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import type { AdminActionResult } from "@/lib/actions/admin";
import { audit, changedFields, requireSuperadmin } from "@/lib/superadmin";
import { createAdminClient } from "@/lib/supabase/admin";
import { industrySchema, type IndustryInput } from "@/lib/validations/category.schema";

// Phase 18, deliverable 1: industries are platform data. New organizations are created in one and get its
// catalog, default modules, units, tax setting and onboarding steps. Service role, audited.

const fail = (message: string): AdminActionResult => ({ status: "error", message });

/** Creates (no `id`) or saves an industry. Changes apply to new organizations; existing ones keep their settings. */
export async function saveIndustry(input: IndustryInput, id?: string): Promise<AdminActionResult> {
  const me = await requireSuperadmin();
  const parsed = industrySchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0].message);
  const i = parsed.data;
  const row = {
    name: i.name,
    slug: i.slug,
    description: i.description || null,
    icon: i.icon,
    sort_order: i.sortOrder,
    is_active: i.isActive,
    default_modules: [...new Set(i.defaultModules)],
    default_uoms: [...new Set(i.defaultUoms)],
    default_settings: { prices_include_tax: i.pricesIncludeTax },
    onboarding_steps: [...new Set(i.onboardingSteps)],
  };
  const admin = createAdminClient();

  if (id) {
    if (!z.uuid().safeParse(id).success) return fail("Invalid industry.");
    const { data: before } = await admin.from("industries").select("*").eq("id", id).maybeSingle();
    if (!before) return fail("That industry no longer exists. Refresh the page.");
    if (!row.is_active && before.is_active) {
      const { count } = await admin.from("industries").select("id", { count: "exact", head: true }).eq("is_active", true).neq("id", id);
      if (!count) return fail("Keep at least one industry open for new organizations.");
    }
    const { error } = await admin.from("industries").update({ ...row, updated_at: new Date().toISOString() }).eq("id", id);
    if (error) return error.code === "23505" ? fail("Another industry already uses this name or slug.") : dbFail(error);
    const diff = changedFields(before, row);
    if (Object.keys(diff.after).length) await audit({ adminId: me.userId, action: "industry.update", details: { id, name: i.name, ...diff } });
  } else {
    const { data, error } = await admin.from("industries").insert(row).select("id").single();
    if (error) return error.code === "23505" ? fail("Another industry already uses this name or slug.") : dbFail(error);
    await audit({ adminId: me.userId, action: "industry.create", details: { id: data.id, name: i.name, slug: i.slug } });
  }
  refresh();
  return { status: "success" };
}

/** Only an industry nobody uses: no organizations, categories or attributes. Otherwise close it for new organizations. */
export async function deleteIndustry(id: string): Promise<AdminActionResult> {
  const me = await requireSuperadmin();
  if (!z.uuid().safeParse(id).success) return fail("Invalid industry.");
  const admin = createAdminClient();
  const { data: industry } = await admin.from("industries").select("name, slug").eq("id", id).maybeSingle();
  if (!industry) return fail("That industry no longer exists. Refresh the page.");
  const [{ count: orgs }, { count: cats }, { count: attrs }] = await Promise.all([
    admin.from("tenants").select("id", { count: "exact", head: true }).eq("industry_id", id),
    admin.from("categories").select("id", { count: "exact", head: true }).eq("industry_id", id),
    admin.from("category_attributes").select("id", { count: "exact", head: true }).eq("industry_id", id),
  ]);
  if (orgs) return fail(`${orgs} organizations use this industry. Move them first, or close it for new organizations.`);
  if (cats || attrs) return fail("This industry still has categories or attributes. Delete them first, or close it for new organizations.");
  const { error } = await admin.from("industries").delete().eq("id", id);
  if (error) return dbFail(error);
  await audit({ adminId: me.userId, action: "industry.delete", details: { id, name: industry.name, slug: industry.slug } });
  refresh();
  return { status: "success" };
}

function dbFail(error: { message: string }): AdminActionResult {
  console.error("industry action failed:", error);
  return fail("We couldn't save this. Please try again.");
}
