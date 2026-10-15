import type { Metadata } from "next";
import { DocumentListPage } from "@/components/quotes/document-pages";

export const metadata: Metadata = { title: "Drafts" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default function DraftsPage({ searchParams }: { searchParams: SearchParams }) {
  return <DocumentListPage section="drafts" searchParams={searchParams} />;
}
