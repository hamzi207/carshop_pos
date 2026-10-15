import type { Metadata } from "next";
import { EditDocumentPage } from "@/components/quotes/document-pages";

export const metadata: Metadata = { title: "Invoice" };

type Params = Promise<{ id: string }>;

export default function InvoicePage({ params }: { params: Params }) {
  return <EditDocumentPage section="invoices" params={params} />;
}
