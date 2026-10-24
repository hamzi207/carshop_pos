import { Suspense } from "react";
import type { Metadata } from "next";
import { getShopSession } from "@/lib/auth";
import { getCategories, getCategoryCounts, getCategoryRequests } from "@/lib/category-data";
import { CategoryBrowser } from "@/components/settings/category-browser";
import { SettingsLoading } from "@/components/settings/shop-settings-section";

export const metadata: Metadata = { title: "Settings · Categories" };

async function CategoriesContent() {
  const [session, categories, counts, requests] = await Promise.all([getShopSession(), getCategories(), getCategoryCounts(), getCategoryRequests()]);
  return <CategoryBrowser categories={categories} counts={counts} requests={requests} readOnly={Boolean(session.impersonating)} />;
}

export default function SettingsCategoriesPage() {
  return (
    <Suspense fallback={<SettingsLoading />}>
      <CategoriesContent />
    </Suspense>
  );
}
