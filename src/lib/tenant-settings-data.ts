import "server-only";
import { cache } from "react";
import { mapTenant, TENANT_COLUMNS } from "@/lib/auth";
import type { Category } from "@/lib/categories";
import { requireSuperadmin } from "@/lib/superadmin";
import { createAdminClient } from "@/lib/supabase/admin";

// The console's settings tabs (Phase 17, deliverable 3): any organization's settings, read with the
// service role, in the same shape the organization's own Settings pages use, so both render the
// same forms.

/** The organization as getShopSession().tenant has it (null if not found). Cached per request. */
export const getTenantSettings = cache(async (tenantId: string) => {
  await requireSuperadmin();
  const { data } = await createAdminClient().from("tenants").select(TENANT_COLUMNS).eq("id", tenantId).maybeSingle();
  return data ? mapTenant(data) : null;
});

/** Settings → Documents: numbering, terms, bank details, and the highest numbers already used. */
export async function getTenantDocumentSettings(tenantId: string) {
  await requireSuperadmin();
  const admin = createAdminClient();
  const [{ data: t }, { data: floors }] = await Promise.all([
    admin
      .from("tenants")
      .select(
        "quote_prefix, quote_start_number, invoice_prefix, invoice_start_number, draft_prefix, draft_start_number, quote_footer_notes, invoice_terms, bank_name, bank_account_title, bank_account_number, bank_iban, bank_raast_id, bank_wallets",
      )
      .eq("id", tenantId)
      .maybeSingle(),
    admin.rpc("admin_document_number_floors", { p_tenant: tenantId }),
  ]);
  return t ? { row: t, floors: (floors ?? {}) as Record<string, unknown> } : null;
}

/** Settings → Categories: the organization's categories and items per category. */
export async function getTenantCategories(tenantId: string): Promise<{ categories: Category[]; counts: Record<string, number> }> {
  await requireSuperadmin();
  const admin = createAdminClient();
  const [{ data: categories, error }, { data: items }] = await Promise.all([
    admin.from("categories").select("id, name, parent_id, sort_order").eq("tenant_id", tenantId),
    admin.from("inventory_items").select("category_id").eq("tenant_id", tenantId),
  ]);
  if (error) throw new Error(`categories: ${error.message}`);
  const counts: Record<string, number> = {};
  for (const { category_id } of items ?? []) counts[category_id] = (counts[category_id] ?? 0) + 1;
  return { categories: categories ?? [], counts };
}
