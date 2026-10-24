import { Suspense } from "react";
import type { Metadata } from "next";
import { AttributeManager } from "@/components/admin/attribute-manager";
import { CategoryCatalogEditor } from "@/components/admin/category-catalog-editor";
import { SettingsLoading } from "@/components/settings/shop-settings-section";
import { getTenantCategoryView } from "@/lib/admin-category-data";
import { tenantParam } from "@/lib/admin-params";

export const metadata: Metadata = { title: "Shop · Categories" };

type Params = Promise<{ id: string }>;

async function Categories({ params }: { params: Params }) {
  const id = await tenantParam(params);
  const view = await getTenantCategoryView(id);
  return (
    <>
      <CategoryCatalogEditor scope={{ tenantId: id }} categories={view.categories} counts={view.counts} hiddenIds={view.hiddenIds} />
      <AttributeManager scope={{ tenantId: id }} attributes={view.attributes} categories={view.categories} inheritedKeys={view.industryKeys} />
    </>
  );
}

/** Categories tab (Phase 18, deliverable 4): the industry's catalog as this organization sees it, plus its own categories and attributes. */
export default function TenantCategoriesPage({ params }: { params: Params }) {
  return (
    <Suspense fallback={<SettingsLoading />}>
      <Categories params={params} />
    </Suspense>
  );
}
