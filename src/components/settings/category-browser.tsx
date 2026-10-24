"use client";

import { useMemo, useState } from "react";
import { FolderTree, MessageSquarePlus, Plus } from "lucide-react";
import { CategoryTree } from "@/components/categories/category-tree";
import { SubscriptionDialog as FormDialog, useSubmit } from "@/components/subscription/subscription-dialog";
import { requestCategory } from "@/lib/actions/categories";
import { buildCategoryIndex, fullPath, MAX_CATEGORY_DEPTH, type Category, type CategoryNode } from "@/lib/categories";
import type { CategoryRequestRow } from "@/lib/category-data";

type Props = {
  categories: Category[];
  /** Items per category id. */
  counts: Record<string, number>;
  requests: CategoryRequestRow[];
  /** Read-only Login As: no requests. */
  readOnly: boolean;
};

const STATUS: Record<CategoryRequestRow["status"], { label: string; tone: string }> = {
  pending: { label: "Waiting for review", tone: "badge-amber" },
  approved_tenant: { label: "Added", tone: "badge-green" },
  approved_industry: { label: "Added", tone: "badge-green" },
  rejected: { label: "Declined", tone: "badge-red" },
};

function RequestDialog({ index, parent, onClose }: { index: ReturnType<typeof buildCategoryIndex>; parent: CategoryNode | null; onClose: () => void }) {
  const [name, setName] = useState("");
  const [parentId, setParentId] = useState(parent?.id ?? "");
  const [note, setNote] = useState("");
  const { busy, error, run } = useSubmit(onClose, "Request sent");
  // A new category can go under anything above the 4th level.
  const parents = index.flat.filter((n) => !n.archived && n.depth < MAX_CATEGORY_DEPTH);
  return (
    <FormDialog
      open
      onClose={onClose}
      icon={MessageSquarePlus}
      title="Request a category"
      description="ProductLogik reviews requests and adds the category for you, usually within a working day."
      submitLabel="Send request"
      busy={busy}
      error={error}
      onSubmit={() =>
        void run(async () => {
          const result = await requestCategory({ name, parentId: parentId || null, note });
          return result.status === "success" ? { status: "success", message: "You'll get an email and a notification when it's reviewed." } : result;
        })
      }
    >
      <label className="span-two">
        <span>CATEGORY NAME</span>
        <input autoFocus value={name} maxLength={60} placeholder="e.g. Herbal Tea" onChange={(e) => setName(e.target.value)} />
      </label>
      <label className="span-two">
        <span>PUT IT UNDER</span>
        <select value={parentId} onChange={(e) => setParentId(e.target.value)}>
          <option value="">Nothing (a new main category)</option>
          {parents.map((n) => (
            <option key={n.id} value={n.id}>{fullPath(n)}</option>
          ))}
        </select>
      </label>
      <label className="span-two">
        <span>NOTE (OPTIONAL)</span>
        <textarea rows={3} value={note} maxLength={500} placeholder="What will you keep in it?" onChange={(e) => setNote(e.target.value)} />
      </label>
    </FormDialog>
  );
}

/**
 * Settings → Categories (Phase 18): the organization's tree, read-only. ProductLogik manages categories;
 * anything missing is requested here and shows up once approved.
 */
export function CategoryBrowser({ categories, counts, requests, readOnly }: Props) {
  // Archived categories only show while items still use them.
  const index = useMemo(() => {
    const full = buildCategoryIndex(categories, counts);
    return buildCategoryIndex(categories.filter((c) => !full.byId.get(c.id)?.archived || (full.byId.get(c.id)?.itemCount ?? 0) > 0), counts);
  }, [categories, counts]);
  const [asking, setAsking] = useState<{ parent: CategoryNode | null } | null>(null);

  return (
    <>
      <section className="card settings-card category-manager">
        <div className="settings-card-head">
          <span className="header-icon blue"><FolderTree size={18} /></span>
          <div>
            <h2>Product categories</h2>
            <p>
              {index.roots.length} main categories · {index.flat.length} in total, set up for your industry by ProductLogik.
              Items can use any level; inventory filters include everything below the chosen category.
            </p>
          </div>
        </div>
        <CategoryTree
          index={index}
          dimmed={(n) => n.archived}
          renderMeta={(node) => (
            <>
              {node.archived && <span className="badge badge-muted">Archived</span>}
              <span className={`badge${node.itemCount ? "" : " badge-muted"}`}>
                {node.itemCount} {node.itemCount === 1 ? "item" : "items"}
              </span>
            </>
          )}
          renderActions={
            readOnly
              ? undefined
              : (node) =>
                  node.depth < MAX_CATEGORY_DEPTH && !node.archived ? (
                    <button type="button" className="icon-button" title="Request a subcategory here" aria-label={`Request a subcategory in ${node.name}`} onClick={() => setAsking({ parent: node })}>
                      <Plus size={15} />
                    </button>
                  ) : null
          }
          toolbar={
            readOnly ? null : (
              <button type="button" className="button button-primary" onClick={() => setAsking({ parent: null })}>
                <MessageSquarePlus size={14} /> Request a category
              </button>
            )
          }
        />
      </section>

      {requests.length > 0 && (
        <section className="card settings-card">
          <div className="settings-card-head">
            <span className="header-icon blue"><MessageSquarePlus size={18} /></span>
            <div>
              <h2>Your requests</h2>
              <p>The last {requests.length} category {requests.length === 1 ? "request" : "requests"} from your organization.</p>
            </div>
          </div>
          <ul className="cat-request-list">
            {requests.map((r) => {
              const created = r.created_category_id ? index.byId.get(r.created_category_id) : undefined;
              const parent = r.suggested_parent_id ? index.byId.get(r.suggested_parent_id) : undefined;
              return (
                <li key={r.id}>
                  <div>
                    <strong>{created ? fullPath(created) : parent ? `${fullPath(parent)} › ${r.name}` : r.name}</strong>
                    {r.status === "rejected" && r.resolution_note && <small>Reason: {r.resolution_note}</small>}
                    {r.status === "pending" && r.note && <small>{r.note}</small>}
                  </div>
                  <span className={`badge ${STATUS[r.status].tone}`}>{STATUS[r.status].label}</span>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {asking && <RequestDialog index={index} parent={asking.parent} onClose={() => setAsking(null)} />}
    </>
  );
}
