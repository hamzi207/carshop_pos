import { Suspense } from "react";
import type { Metadata } from "next";
import { getShopSession } from "@/lib/auth";
import { getCategories, getCategoryCounts } from "@/lib/category-data";
import { CategoryManager } from "@/components/settings/category-manager";
import { SettingsLoading } from "@/components/settings/shop-settings-section";

export const metadata: Metadata = { title: "Settings · Categories" };

async function CategoriesContent() {
  const [{ role }, categories, counts] = await Promise.all([getShopSession(), getCategories(), getCategoryCounts()]);
  return <CategoryManager categories={categories} counts={counts} canEdit={role === "admin"} />;
}

export default function SettingsCategoriesPage() {
  return (
    <Suspense fallback={<SettingsLoading />}>
      <CategoriesContent />
    </Suspense>
  );
}
