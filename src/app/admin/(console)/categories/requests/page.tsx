import { Suspense } from "react";
import type { Metadata } from "next";
import { SectionTabs } from "@/components/admin/section-tabs";
import { CategoryRequestQueue } from "@/components/admin/category-request-queue";
import { getAllCategoryRequests, getRequestTrees } from "@/lib/admin-category-data";

export const metadata: Metadata = { title: "Category requests" };

async function Requests() {
  const requests = await getAllCategoryRequests();
  return <CategoryRequestQueue requests={requests} trees={await getRequestTrees(requests)} />;
}

/** Category requests (Phase 18, deliverable 5): organizations ask, the superadmin adds the category or says why not. */
export default function CategoryRequestsPage() {
  return (
    <div className="page">
      <div className="page-heading">
        <div>
          <span className="eyebrow">CATALOG</span>
          <h1>Category requests</h1>
          <p>Approve into the organization&apos;s own categories or its whole industry, or decline with a reason. The requester is emailed either way.</p>
        </div>
      </div>
      <SectionTabs section="catalog" />
      <Suspense fallback={<section className="card"><div className="empty-state">Loading requests…</div></section>}>
        <Requests />
      </Suspense>
    </div>
  );
}
