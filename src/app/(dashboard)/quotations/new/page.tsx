import type { Metadata } from "next";
import { NewDocumentPage } from "@/components/quotes/document-pages";

export const metadata: Metadata = { title: "New Quotation" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default function NewQuotationPage({ searchParams }: { searchParams: SearchParams }) {
  return <NewDocumentPage section="quotations" searchParams={searchParams} />;
}
