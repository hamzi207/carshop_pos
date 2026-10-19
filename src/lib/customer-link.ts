import type { PrintableDocument } from "@/lib/printable";

/**
 * The customer's view-only link (the POS slip's QR code). NEXT_PUBLIC_APP_URL is the deployed
 * address, otherwise the request's origin. Drafts and cancelled documents can't be shared: null.
 */
export function customerLink(doc: PrintableDocument, origin: string) {
  if (doc.section === "drafts" || doc.statusKey === "void" || doc.statusKey === "cancelled") return null;
  const base = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") || origin;
  return `${base}/share/${doc.shareToken}`;
}
