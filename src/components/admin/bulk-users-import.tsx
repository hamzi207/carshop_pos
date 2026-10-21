"use client";

import { useState } from "react";
import { CheckCircle2, FileUp, XCircle } from "lucide-react";
import { SubscriptionDialog } from "@/components/subscription/subscription-dialog";
import { bulkInviteUsers, type BulkUserResult, type BulkUserRow } from "@/lib/actions/admin-console";
import { downloadCsv, parseCsv, toCsv } from "@/lib/csv";

const MAX_ROWS = 50;

/** Reads "name, email, role" (header row required; role is admin or staff, empty = staff). */
function readUsers(text: string): { rows: BulkUserRow[]; error?: string } {
  const [header, ...lines] = parseCsv(text).filter((r) => r.some((c) => c.trim() !== ""));
  if (!header) return { rows: [], error: "The file is empty." };
  const col = (...names: string[]) => header.findIndex((h) => names.includes(h.trim().toLowerCase()));
  const name = col("name", "full name", "full_name");
  const email = col("email", "email address");
  const role = col("role");
  if (name < 0 || email < 0) return { rows: [], error: "The first row must have Name and Email columns (Role is optional)." };
  if (lines.length > MAX_ROWS) return { rows: [], error: `Up to ${MAX_ROWS} users per file; this one has ${lines.length}.` };
  return { rows: lines.map((l) => ({ fullName: l[name] ?? "", email: l[email] ?? "", role: role >= 0 ? (l[role] ?? "") : "" })) };
}

/** Users tab: invite up to 50 people from a CSV; each row reports whether it worked. */
export function BulkUsersImport({ tenantId, onClose }: { tenantId: string; onClose: () => void }) {
  const [rows, setRows] = useState<BulkUserRow[]>([]);
  const [fileError, setFileError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [results, setResults] = useState<BulkUserResult[] | null>(null);

  const choose = async (file: File | undefined) => {
    setResults(null);
    if (!file) return;
    const read = readUsers(await file.text());
    setRows(read.rows);
    setFileError(read.error ?? (read.rows.length ? null : "No users in the file."));
  };

  const run = async () => {
    if (results) return onClose();
    setBusy(true);
    const result = await bulkInviteUsers(tenantId, rows);
    setBusy(false);
    if (result.status === "error") setFileError(result.message);
    else setResults(result.results);
  };

  const ok = results?.filter((r) => r.ok).length ?? 0;
  return (
    <SubscriptionDialog
      open
      onClose={onClose}
      icon={FileUp}
      title="Import users from CSV"
      description="Columns: Name, Email, Role (admin or staff; empty = staff). Each person gets the normal invitation email, and the plan's user limit applies."
      submitLabel={results ? "Done" : rows.length ? `Invite ${rows.length} ${rows.length === 1 ? "User" : "Users"}` : "Invite"}
      busy={busy}
      error={fileError}
      onSubmit={() => void run()}
    >
      {!results ? (
        <>
          <label className="span-two">
            <span>CSV FILE</span>
            <input type="file" accept=".csv,text/csv" onChange={(e) => void choose(e.target.files?.[0])} />
          </label>
          <p className="span-two csv-help">
            {rows.length ? `${rows.length} ${rows.length === 1 ? "row" : "rows"} ready.` : "Up to 50 rows. "}
            <button
              type="button"
              className="link-button"
              onClick={() => downloadCsv("users-template.csv", toCsv(["Name", "Email", "Role"], [["Ayesha Khan", "ayesha@example.com", "staff"]]))}
            >
              Download a template
            </button>
          </p>
        </>
      ) : (
        <div className="span-two">
          <p className="csv-help">{ok} of {results.length} invited.</p>
          <ul className="bulk-results">
            {results.map((r, i) => (
              <li key={i} className={r.ok ? "is-ok" : "is-error"}>
                {r.ok ? <CheckCircle2 size={14} /> : <XCircle size={14} />}
                <span><strong>{r.email || "(no email)"}</strong> {r.message}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </SubscriptionDialog>
  );
}
