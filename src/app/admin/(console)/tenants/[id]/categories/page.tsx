import { Suspense } from "react";
import type { Metadata } from "next";
import { CategoryManager } from "@/components/settings/category-manager";
import { SettingsLoading } from "@/components/settings/shop-settings-section";
import { tenantParam } from "@/lib/admin-params";
import { getTenantCategories } from "@/lib/tenant-settings-data";

export const metadata: Metadata = { title: "Shop · Categories" };

type Params = Promise<{ id: string }>;

async function Categories({ params }: { params: Params }) {
  const id = await tenantParam(params);
  const { categories, counts } = await getTenantCategories(id);
  return <CategoryManager tenantId={id} categories={categories} counts={counts} canEdit />;
}

/** Categories tab: the organization's own category tree. */
export default function TenantCategoriesPage({ params }: { params: Params }) {
  return (
    <Suspense fallback={<SettingsLoading />}>
      <Categories params={params} />
    </Suspense>
  );
}
