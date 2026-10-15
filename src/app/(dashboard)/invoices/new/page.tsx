import type { Metadata } from "next";
import { NewDocumentPage } from "@/components/quotes/document-pages";

export const metadata: Metadata = { title: "New Invoice" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default function NewInvoicePage({ searchParams }: { searchParams: SearchParams }) {
  return <NewDocumentPage section="invoices" searchParams={searchParams} />;
}
