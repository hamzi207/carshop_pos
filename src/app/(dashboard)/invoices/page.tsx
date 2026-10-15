import type { Metadata } from "next";
import { DocumentListPage } from "@/components/quotes/document-pages";

export const metadata: Metadata = { title: "Invoices" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default function InvoicesPage({ searchParams }: { searchParams: SearchParams }) {
  return <DocumentListPage section="invoices" searchParams={searchParams} />;
}
