import { Suspense } from "react";
import { pendingRequestCount } from "@/lib/admin-category-data";
import { requireSuperadmin } from "@/lib/superadmin";
import { ActiveSectionTabs, SectionTabList, type Section } from "./section-tab-list";

async function Tabs({ section }: { section: Section }) {
  await requireSuperadmin();
  const badges = section === "catalog" ? { "/admin/categories/requests": await pendingRequestCount() } : undefined;
  return <ActiveSectionTabs section={section} badges={badges} />;
}

/** A top-nav group's tabs (Organizations, Catalog, Billing); Catalog shows pending category requests on Requests. */
export function SectionTabs({ section }: { section: Section }) {
  // usePathname() is request data: it streams in after the static shell.
  return (
    <Suspense fallback={<SectionTabList section={section} pathname={null} />}>
      <Tabs section={section} />
    </Suspense>
  );
}
