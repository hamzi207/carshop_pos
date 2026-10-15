import type { Metadata } from "next";
import { EditDocumentPage } from "@/components/quotes/document-pages";

export const metadata: Metadata = { title: "Draft" };

type Params = Promise<{ id: string }>;

export default function DraftPage({ params }: { params: Params }) {
  return <EditDocumentPage section="drafts" params={params} />;
}
