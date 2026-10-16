import "server-only";
import { renderToBuffer } from "@react-pdf/renderer";
import { DocumentPdf } from "@/components/pdf/document-pdf";
import type { PrintableDocument } from "@/lib/printable";

/** Downloads the shop logo for embedding; a missing or broken logo just leaves it out. */
async function fetchLogo(url: string | null) {
  if (!url) return null;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) return null;
    const type = res.headers.get("content-type") ?? "";
    const format = type.includes("png") ? "png" : type.includes("jpeg") || type.includes("jpg") ? "jpg" : null;
    if (!format) return null;
    return { data: Buffer.from(await res.arrayBuffer()), format } as const;
  } catch {
    return null;
  }
}

/** The document as a PDF response: inline (opens in the browser) or as a download. */
export async function pdfResponse(doc: PrintableDocument, download: boolean) {
  const buffer = await renderToBuffer(<DocumentPdf doc={doc} logo={await fetchLogo(doc.shop.logoUrl)} />);
  const filename = `${doc.title}-${doc.number}.pdf`.replace(/[^\w.-]+/g, "-");
  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `${download ? "attachment" : "inline"}; filename="${filename}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
