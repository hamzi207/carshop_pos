"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { PHONE_QUERY } from "@/lib/hooks/use-media-query";
import type { PrintFormat } from "@/lib/validations/settings.schema";
import { usePosSlipPrint } from "./pos-slip";

/**
 * The document screen's Print button, in the shop's print format (Settings → Print format):
 * - "pos": the 80mm slip is drawn into the page and printed there (usePosSlipPrint).
 * - "a4": the A4 PDF is loaded into a hidden frame on the page and printed from it, so the
 *   print dialog opens without leaving the screen. Phones (and browsers without a built-in PDF
 *   viewer) can't print a PDF from inside a page; there it opens in the device's PDF viewer.
 */
export function usePrintDocument(format: PrintFormat) {
  const slip = usePosSlipPrint();
  const [loadingPdf, setLoadingPdf] = useState(false);
  const frame = useRef<HTMLIFrameElement | null>(null);

  // The frame stays until the next print (the PDF viewer prints asynchronously); gone with the page.
  useEffect(() => () => frame.current?.remove(), []);

  const printPdf = useCallback((id: string) => {
    const url = `/api/documents/${id}/pdf`;
    if (!navigator.pdfViewerEnabled || window.matchMedia(PHONE_QUERY).matches) {
      window.open(url, "_blank", "noopener,noreferrer");
      return;
    }
    frame.current?.remove();
    const el = document.createElement("iframe");
    el.className = "print-frame";
    // Off-screen, not display:none, so the PDF viewer still loads it.
    el.style.cssText = "position:fixed;top:0;left:-10000px;width:800px;height:600px;border:0;visibility:hidden";
    el.title = "Print";
    el.setAttribute("aria-hidden", "true");
    el.onload = () => {
      setLoadingPdf(false);
      // Give the PDF viewer a moment to lay out the pages.
      window.setTimeout(() => {
        try {
          el.contentWindow?.focus();
          el.contentWindow?.print();
        } catch {
          window.open(url, "_blank", "noopener,noreferrer");
        }
      }, 300);
    };
    el.src = url;
    setLoadingPdf(true);
    document.body.appendChild(el);
    frame.current = el;
  }, []);

  const printSlip = slip.print;
  const print = useCallback((id: string) => (format === "pos" ? void printSlip(id) : printPdf(id)), [format, printSlip, printPdf]);

  return {
    print,
    label: format === "pos" ? "Print POS Slip" : "Print PDF",
    loading: format === "pos" ? slip.loading : loadingPdf,
    /** Render once on the page (the POS slip while it prints). */
    element: slip.element,
  };
}
