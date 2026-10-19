"use client";

import { Download } from "lucide-react";
import { downloadCsv, toCsv, type CsvCell } from "@/lib/csv";
import { notify } from "@/lib/notify";

/** Downloads a table as CSV (opens in Excel; the BOM keeps "Rs." and accents intact). */
export function CsvButton({ filename, header, rows }: { filename: string; header: string[]; rows: CsvCell[][] }) {
  const download = () => {
    downloadCsv(filename, toCsv(header, rows));
    notify.success("CSV downloaded", `${filename} · ${rows.length} ${rows.length === 1 ? "row" : "rows"}.`);
  };
  return (
    <button type="button" className="button button-sm" onClick={download} disabled={rows.length === 0}>
      <Download size={13} /> CSV
    </button>
  );
}
