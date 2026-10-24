"use client";

import { useMemo, useState } from "react";
import { Check, Inbox, X } from "lucide-react";
import { adminDateTime } from "@/components/admin/format";
import { SubscriptionDialog as FormDialog, useSubmit } from "@/components/subscription/subscription-dialog";
import { resolveCategoryRequest } from "@/lib/actions/admin-categories";
import type { CategoryRequestView } from "@/lib/admin-category-data";
import { buildCategoryIndex, fullPath, MAX_CATEGORY_DEPTH, type Category } from "@/lib/categories";

type Props = {
  requests: CategoryRequestView[];
  /** Pending requests' organization trees, by organization id. */
  trees: Record<string, Category[]>;
};

const RESULT: Record<CategoryRequestView["status"], { label: string; tone: string }> = {
  pending: { label: "Pending", tone: "badge-amber" },
  approved_tenant: { label: "Added for the organization", tone: "badge-green" },
  approved_industry: { label: "Added to the industry", tone: "badge-green" },
  rejected: { label: "Declined", tone: "badge-red" },
};

function ApproveDialog({ request, tree, onClose }: { request: CategoryRequestView; tree: Category[]; onClose: () => void }) {
  const [mode, setMode] = useState<"tenant" | "industry">("tenant");
  const [name, setName] = useState(request.name);
  const [parentId, setParentId] = useState(request.suggestedParentId ?? "");
  const [note, setNote] = useState("");
  const { busy, error, run } = useSubmit(onClose, "Request approved");
  const index = useMemo(() => buildCategoryIndex(tree), [tree]);
  // Into the industry: only under catalog categories. For the organization: anywhere in its tree.
  const parents = index.flat.filter((n) => !n.archived && n.depth < MAX_CATEGORY_DEPTH && (mode === "tenant" || !n.tenant_id));
  const parentOk = !parentId || parents.some((p) => p.id === parentId);
  return (
    <FormDialog
      open
      onClose={onClose}
      icon={Check}
      title={`Approve “${request.name}”`}
      description={`From ${request.requester} at ${request.tenantName} (${request.industryName}).`}
      submitLabel="Approve and notify"
      busy={busy}
      error={error ?? (parentOk ? null : "That parent is the organization's own category. Pick a catalog category, or add it for the organization only.")}
      onSubmit={() => {
        if (parentOk) void run(() => resolveCategoryRequest(request.id, { mode, name, parentId: parentId || null, note }));
      }}
    >
      <div className="span-two segmented" role="radiogroup" aria-label="Add for">
        <button type="button" role="radio" aria-checked={mode === "tenant"} className={mode === "tenant" ? "active" : undefined} onClick={() => setMode("tenant")}>
          Only {request.tenantName}
        </button>
        <button type="button" role="radio" aria-checked={mode === "industry"} className={mode === "industry" ? "active" : undefined} onClick={() => setMode("industry")}>
          Everyone in {request.industryName}
        </button>
      </div>
      <label className="span-two">
        <span>NAME</span>
        <input value={name} maxLength={60} onChange={(e) => setName(e.target.value)} />
      </label>
      <label className="span-two">
        <span>UNDER</span>
        <select value={parentId} onChange={(e) => setParentId(e.target.value)}>
          <option value="">Nothing (a main category)</option>
          {parents.map((n) => (
            <option key={n.id} value={n.id}>
              {fullPath(n)}
              {n.tenant_id ? " (own)" : ""}
            </option>
          ))}
        </select>
      </label>
      <label className="span-two">
        <span>NOTE TO THE ORGANIZATION (OPTIONAL)</span>
        <input value={note} maxLength={500} onChange={(e) => setNote(e.target.value)} />
      </label>
    </FormDialog>
  );
}

function RejectDialog({ request, onClose }: { request: CategoryRequestView; onClose: () => void }) {
  const [reason, setReason] = useState("");
  const { busy, error, run } = useSubmit(onClose, "Request declined");
  return (
    <FormDialog
      open
      destructive
      onClose={onClose}
      icon={X}
      title={`Decline “${request.name}”`}
      description={`${request.requester} at ${request.tenantName} is emailed the reason.`}
      submitLabel="Decline and notify"
      busy={busy}
      error={error}
      onSubmit={() => void run(() => resolveCategoryRequest(request.id, { mode: "reject", reason }))}
    >
      <label className="span-two">
        <span>REASON</span>
        <textarea autoFocus rows={3} value={reason} maxLength={500} placeholder="e.g. Use Beverages › Tea instead; it already covers this." onChange={(e) => setReason(e.target.value)} />
      </label>
    </FormDialog>
  );
}

/** /admin/categories/requests: pending requests first (oldest first), then recent decisions. */
export function CategoryRequestQueue({ requests, trees }: Props) {
  const [dialog, setDialog] = useState<{ kind: "approve" | "reject"; request: CategoryRequestView } | null>(null);
  const pending = requests.filter((r) => r.status === "pending");
  return (
    <section className="card settings-card">
      <div className="settings-card-head">
        <span className="header-icon blue"><Inbox size={18} /></span>
        <div>
          <h2>{pending.length} pending</h2>
          <p>Followed by the last {requests.length - pending.length} decisions.</p>
        </div>
      </div>
      {requests.length === 0 ? (
        <div className="empty-state"><strong>No requests yet</strong></div>
      ) : (
        <div className="table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>REQUEST</th>
                <th>ORGANIZATION</th>
                <th>ASKED</th>
                <th>RESULT</th>
                <th><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody>
              {requests.map((r) => (
                <tr key={r.id}>
                  <td className="primary-cell">
                    <strong>{r.suggestedParentPath ? `${r.suggestedParentPath} › ${r.name}` : r.name}</strong>
                    {r.note && <span>{r.note}</span>}
                  </td>
                  <td className="primary-cell">
                    <strong>{r.tenantName}</strong>
                    <span>{r.industryName} · {r.requester}</span>
                  </td>
                  <td>{adminDateTime(r.createdAt)}</td>
                  <td className="primary-cell">
                    <strong><span className={`badge ${RESULT[r.status].tone}`}>{RESULT[r.status].label}</span></strong>
                    {r.status !== "pending" && (
                      <span>
                        {r.resolver ?? "A superadmin"}
                        {r.resolvedAt ? `, ${adminDateTime(r.resolvedAt)}` : ""}
                        {r.resolutionNote ? `: ${r.resolutionNote}` : ""}
                      </span>
                    )}
                  </td>
                  <td>
                    {r.status === "pending" && (
                      <div className="row-actions admin-row-actions">
                        <button type="button" className="button button-primary" onClick={() => setDialog({ kind: "approve", request: r })}>
                          <Check size={14} /> Approve
                        </button>
                        <button type="button" className="button" onClick={() => setDialog({ kind: "reject", request: r })}>
                          <X size={14} /> Decline
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {dialog?.kind === "approve" && <ApproveDialog request={dialog.request} tree={trees[dialog.request.tenantId] ?? []} onClose={() => setDialog(null)} />}
      {dialog?.kind === "reject" && <RejectDialog request={dialog.request} onClose={() => setDialog(null)} />}
    </section>
  );
}
