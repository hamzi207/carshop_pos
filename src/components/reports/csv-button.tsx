"use client";

import { Download } from "lucide-react";
import { notify } from "@/lib/notify";

type Cell = string | number | null;

/** RFC 4180 field: quoted when it contains a comma, quote or line break. */
function field(v: Cell) {
  const s = v === null ? "" : String(v);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Downloads a table as CSV (opens in Excel; the BOM keeps "Rs." and accents intact). */
export function CsvButton({ filename, header, rows }: { filename: string; header: string[]; rows: Cell[][] }) {
  const download = () => {
    const csv = [header, ...rows].map((r) => r.map(field).join(",")).join("\r\n");
    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
    notify.success("CSV downloaded", `${filename} · ${rows.length} ${rows.length === 1 ? "row" : "rows"}.`);
  };
  return (
    <button type="button" className="button button-sm" onClick={download} disabled={rows.length === 0}>
      <Download size={13} /> CSV
    </button>
  );
}
