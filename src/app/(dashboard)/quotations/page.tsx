import type { Metadata } from "next";
import { DocumentListPage } from "@/components/quotes/document-pages";

export const metadata: Metadata = { title: "Quotations" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default function QuotationsPage({ searchParams }: { searchParams: SearchParams }) {
  return <DocumentListPage section="quotations" searchParams={searchParams} />;
}
