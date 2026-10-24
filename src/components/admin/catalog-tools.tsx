"use client";

import { useRef, useState, useTransition } from "react";
import { Copy, Download, FileUp, Loader2, Wrench } from "lucide-react";
import { duplicateCatalog, importCatalogCsv, type ImportRow } from "@/lib/actions/admin-categories";
import { notify } from "@/lib/notify";

type Props = {
  industryId: string;
  /** Other industries to copy from (with how many categories they have). */
  others: { id: string; name: string; categories: number }[];
  empty: boolean;
};

const STATUS = { new: "badge-green", existing: "badge-muted", problem: "badge-red" } as const;

/** Duplicate another industry's tree, import a tree from CSV (preview first), export this one (deliverable 3, item 8). */
export function CatalogTools({ industryId, others, empty }: Props) {
  const [from, setFrom] = useState(others.find((o) => o.categories > 0)?.id ?? "");
  const [pending, startTransition] = useTransition();
  const [preview, setPreview] = useState<{ csv: string; name: string; rows: ImportRow[]; created: number } | null>(null);
  const file = useRef<HTMLInputElement>(null);

  const duplicate = () =>
    startTransition(async () => {
      const result = await duplicateCatalog(from, industryId);
      if (result.status === "error") notify.error("Not copied", result.message);
      else notify.success("Categories copied", result.message);
    });

  const read = (f: File | undefined) => {
    if (!f) return;
    startTransition(async () => {
      const csv = await f.text();
      const result = await importCatalogCsv(industryId, csv, false);
      if (result.status === "error") notify.error("Can't import this file", result.message);
      else setPreview({ csv, name: f.name, rows: result.rows, created: result.created });
      if (file.current) file.current.value = "";
    });
  };

  const apply = () =>
    preview &&
    startTransition(async () => {
      const result = await importCatalogCsv(industryId, preview.csv, true);
      if (result.status === "error") notify.error("Not imported", result.message);
      else {
        notify.success("Categories imported", `${result.created} added.`);
        setPreview(null);
      }
    });

  const counts = preview
    ? { new: preview.rows.filter((r) => r.status === "new").length, existing: preview.rows.filter((r) => r.status === "existing").length, problem: preview.rows.filter((r) => r.status === "problem").length }
    : null;

  return (
    <section className="card settings-card">
      <div className="settings-card-head">
        <span className="header-icon blue"><Wrench size={18} /></span>
        <div>
          <h2>Tools</h2>
          <p>Export the tree to edit it in Excel, import a CSV (a “path” column like Beverages › Tea › Green Tea; optional sku_prefix, icon and colour) or start from another industry.</p>
        </div>
        {pending && <Loader2 size={15} className="animate-spin" />}
      </div>
      <div className="catalog-tools">
        <a className="button" href={`/api/admin/categories/export?industry=${industryId}`}>
          <Download size={14} /> Export CSV
        </a>
        <input ref={file} type="file" accept=".csv,text/csv" hidden onChange={(e) => read(e.target.files?.[0])} />
        <button type="button" className="button" disabled={pending} onClick={() => file.current?.click()}>
          <FileUp size={14} /> Import CSV…
        </button>
        {empty && others.length > 0 && (
          <span className="catalog-duplicate">
            <select value={from} onChange={(e) => setFrom(e.target.value)} aria-label="Industry to copy from">
              {others.map((o) => (
                <option key={o.id} value={o.id} disabled={o.categories === 0}>
                  {o.name} ({o.categories})
                </option>
              ))}
            </select>
            <button type="button" className="button" disabled={pending || !from} onClick={duplicate}>
              <Copy size={14} /> Duplicate tree
            </button>
          </span>
        )}
      </div>
      {preview && counts && (
        <div className="import-preview">
          <p>
            <strong>{preview.name}</strong>: {counts.new} new · {counts.existing} already there · {counts.problem} with problems. {preview.created} categories will be
            added (missing parents included); nothing is renamed or removed.
          </p>
          <div className="table-wrap import-preview-table">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>LINE</th>
                  <th>PATH</th>
                  <th>RESULT</th>
                </tr>
              </thead>
              <tbody>
                {preview.rows.slice(0, 300).map((r) => (
                  <tr key={r.line}>
                    <td>{r.line}</td>
                    <td>{r.path}</td>
                    <td>
                      <span className={`badge ${STATUS[r.status]}`}>{r.status === "new" ? "New" : r.status === "existing" ? "Already there" : "Problem"}</span>
                      {r.message && <span className="admin-muted"> {r.message}</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="import-preview-actions">
            <button type="button" className="button" disabled={pending} onClick={() => setPreview(null)}>Cancel</button>
            <button type="button" className="button button-primary" disabled={pending || preview.created === 0} onClick={apply}>
              Import {preview.created} {preview.created === 1 ? "category" : "categories"}
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
