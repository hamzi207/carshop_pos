import type { Metadata } from "next";
import { NewDocumentPage } from "@/components/quotes/document-pages";

export const metadata: Metadata = { title: "New Draft" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default function NewDraftPage({ searchParams }: { searchParams: SearchParams }) {
  return <NewDocumentPage section="drafts" searchParams={searchParams} />;
}
