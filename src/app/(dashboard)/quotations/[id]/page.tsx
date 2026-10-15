import type { Metadata } from "next";
import { EditDocumentPage } from "@/components/quotes/document-pages";

export const metadata: Metadata = { title: "Quotation" };

type Params = Promise<{ id: string }>;

export default function QuotationPage({ params }: { params: Params }) {
  return <EditDocumentPage section="quotations" params={params} />;
}
