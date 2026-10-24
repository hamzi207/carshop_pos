"use client";

import { useMemo, useState, useTransition } from "react";
import { Archive, ArchiveRestore, ListPlus, Loader2, Pencil, Plus, SlidersHorizontal, Trash2 } from "lucide-react";
import { ConfirmDialog, type ConfirmRequest } from "@/components/quotes/confirm-dialog";
import { SubscriptionDialog as FormDialog, useSubmit } from "@/components/subscription/subscription-dialog";
import { deleteAttribute, saveAttribute, setAttributeArchived, type CategoryScope } from "@/lib/actions/admin-categories";
import type { Attribute } from "@/lib/admin-category-data";
import { buildCategoryIndex, fullPath, type Category } from "@/lib/categories";
import { notify } from "@/lib/notify";
import { ATTRIBUTE_TYPES, type AttributeType } from "@/lib/validations/category.schema";

type Props = {
  scope: CategoryScope;
  attributes: Attribute[];
  /** Categories an attribute can be narrowed to (the catalog, or the organization's tree). */
  categories: Category[];
  /** Organization: its industry's attributes apply too (keys it can't reuse). */
  inheritedKeys?: string[];
  title?: string;
};

const typeLabel = (t: string) => ATTRIBUTE_TYPES.find((a) => a.value === t)?.label ?? t;

/** "Warranty Months" → "warranty_months". */
const toKey = (label: string) =>
  label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .replace(/^(\d)/, "a_$1")
    .slice(0, 40);

function AttributeDialog({ scope, attribute, categories, onClose }: { scope: CategoryScope; attribute: Attribute | null; categories: Category[]; onClose: () => void }) {
  const [v, setV] = useState({
    label: attribute?.label ?? "",
    key: attribute?.key ?? "",
    keyTouched: Boolean(attribute),
    type: (attribute?.type ?? "text") as AttributeType,
    options: (attribute?.options ?? []).join("\n"),
    categoryId: attribute?.category_id ?? "",
    isRequired: attribute?.is_required ?? false,
    showOnDocuments: attribute?.show_on_documents ?? false,
    sortOrder: String(attribute?.sort_order ?? 0),
  });
  const { busy, error, run } = useSubmit(onClose, attribute ? "Attribute saved" : "Attribute added");
  const index = useMemo(() => buildCategoryIndex(categories), [categories]);

  return (
    <FormDialog
      open
      onClose={onClose}
      icon={attribute ? Pencil : ListPlus}
      title={attribute ? `Edit ${attribute.label}` : "Add an attribute"}
      description="Shown in the product dialog for the items it applies to, as a filter (lists and yes/no), as a CSV column and, if you like, on documents."
      submitLabel="Save"
      busy={busy}
      error={error}
      onSubmit={() =>
        void run(() =>
          saveAttribute(
            scope,
            {
              label: v.label,
              key: v.key,
              type: v.type,
              options: v.type === "select" ? v.options.split(/\n|,/).map((o) => o.trim()).filter(Boolean) : [],
              categoryId: v.categoryId || null,
              isRequired: v.isRequired,
              showOnDocuments: v.showOnDocuments,
              sortOrder: Number(v.sortOrder || 0),
            },
            attribute?.id,
          ),
        )
      }
    >
      <label>
        <span>LABEL</span>
        <input autoFocus value={v.label} maxLength={60} placeholder="e.g. Warranty (months)" onChange={(e) => setV({ ...v, label: e.target.value, key: v.keyTouched ? v.key : toKey(e.target.value) })} />
      </label>
      <label>
        <span>KEY</span>
        <input value={v.key} maxLength={40} disabled={Boolean(attribute)} onChange={(e) => setV({ ...v, key: e.target.value, keyTouched: true })} />
        <small>{attribute ? "Can't change: items store values under it." : "CSV column attr:" + (v.key || "key")}</small>
      </label>
      <label>
        <span>TYPE</span>
        <select value={v.type} onChange={(e) => setV({ ...v, type: e.target.value as AttributeType })}>
          {ATTRIBUTE_TYPES.map((t) => (
            <option key={t.value} value={t.value}>{t.label}</option>
          ))}
        </select>
      </label>
      <label>
        <span>APPLIES TO</span>
        <select value={v.categoryId} onChange={(e) => setV({ ...v, categoryId: e.target.value })}>
          <option value="">Every category</option>
          {index.flat
            .filter((n) => !n.archived)
            .map((n) => (
              <option key={n.id} value={n.id}>{fullPath(n)} (and below)</option>
            ))}
        </select>
      </label>
      {v.type === "select" && (
        <label className="span-two">
          <span>OPTIONS (ONE PER LINE)</span>
          <textarea rows={4} value={v.options} placeholder={"Small\nMedium\nLarge"} onChange={(e) => setV({ ...v, options: e.target.value })} />
        </label>
      )}
      <label>
        <span>ORDER</span>
        <input inputMode="numeric" value={v.sortOrder} onChange={(e) => setV({ ...v, sortOrder: e.target.value })} />
      </label>
      <div className="span-two">
        <label className="check-field">
          <input type="checkbox" checked={v.isRequired} onChange={(e) => setV({ ...v, isRequired: e.target.checked })} />
          <div>
            <strong>Required</strong>
            <small>Items it applies to can&apos;t be saved without it (existing items: when next edited).</small>
          </div>
        </label>
        <label className="check-field">
          <input type="checkbox" checked={v.showOnDocuments} onChange={(e) => setV({ ...v, showOnDocuments: e.target.checked })} />
          <div>
            <strong>Show on documents</strong>
            <small>Printed under the line description on quotations, invoices and slips.</small>
          </div>
        </label>
      </div>
    </FormDialog>
  );
}

/** RF-18.1: custom product attributes for an industry (every organization in it) or one organization. */
export function AttributeManager({ scope, attributes, categories, inheritedKeys = [], title }: Props) {
  const [dialog, setDialog] = useState<{ attribute: Attribute | null } | null>(null);
  const [pending, startTransition] = useTransition();
  const [confirm, setConfirm] = useState<ConfirmRequest | null>(null);
  const index = useMemo(() => buildCategoryIndex(categories), [categories]);
  const forOrg = "tenantId" in scope;

  const archive = (a: Attribute) =>
    startTransition(async () => {
      const result = await setAttributeArchived(a.id, !a.is_archived);
      if (result.status === "error") notify.error("Not changed", result.message);
      else notify.success(a.is_archived ? "Attribute restored" : "Attribute archived");
    });

  const remove = (a: Attribute) =>
    setConfirm({
      title: `Delete ${a.label}?`,
      body: <p>Only possible while no product has a value for it. This can&apos;t be undone; archive it to keep the values.</p>,
      confirmLabel: "Delete",
      icon: <Trash2 size={18} />,
      tone: "danger",
      onConfirm: () =>
        startTransition(async () => {
          const result = await deleteAttribute(a.id);
          if (result.status === "error") notify.error("Not deleted", result.message);
          else notify.success("Attribute deleted");
          setConfirm(null);
        }),
    });

  return (
    <section className="card settings-card">
      <div className="settings-card-head">
        <span className="header-icon blue"><SlidersHorizontal size={18} /></span>
        <div>
          <h2>{title ?? (forOrg ? "Own attributes" : "Product attributes")}</h2>
          <p>
            {forOrg
              ? `Extra fields for this organization's products only. Its industry's ${inheritedKeys.length} attributes apply too.`
              : "Extra fields for products in this industry (e.g. Brand, Warranty months, Expiry date)."}
          </p>
        </div>
        {pending && <Loader2 size={15} className="animate-spin" />}
        <button type="button" className="button button-primary" onClick={() => setDialog({ attribute: null })}>
          <Plus size={14} /> Attribute
        </button>
      </div>
      {attributes.length === 0 ? (
        <div className="empty-state"><strong>No attributes yet</strong></div>
      ) : (
        <div className="table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>LABEL</th>
                <th>KEY</th>
                <th>TYPE</th>
                <th>APPLIES TO</th>
                <th>RULES</th>
                <th><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody>
              {attributes.map((a) => {
                const cat = a.category_id ? index.byId.get(a.category_id) : undefined;
                return (
                  <tr key={a.id} className={a.is_archived ? "is-retired" : undefined}>
                    <td className="primary-cell">
                      <strong>
                        {a.label}
                        {a.is_archived && <span className="badge">Archived</span>}
                      </strong>
                    </td>
                    <td><code>{a.key}</code></td>
                    <td>
                      {typeLabel(a.type)}
                      {a.type === "select" && <span className="admin-muted"> · {a.options.join(", ")}</span>}
                    </td>
                    <td>{cat ? fullPath(cat) : "Every category"}</td>
                    <td>{[a.is_required && "Required", a.show_on_documents && "On documents"].filter(Boolean).join(" · ") || "—"}</td>
                    <td>
                      <div className="row-actions admin-row-actions">
                        <button type="button" className="icon-button" aria-label={`Edit ${a.label}`} title="Edit" onClick={() => setDialog({ attribute: a })}>
                          <Pencil size={14} />
                        </button>
                        <button type="button" className="icon-button" aria-label={`${a.is_archived ? "Restore" : "Archive"} ${a.label}`} title={a.is_archived ? "Restore" : "Archive (values are kept)"} disabled={pending} onClick={() => archive(a)}>
                          {a.is_archived ? <ArchiveRestore size={14} /> : <Archive size={14} />}
                        </button>
                        <button type="button" className="icon-button danger" aria-label={`Delete ${a.label}`} title="Delete (only if no product has a value)" disabled={pending} onClick={() => remove(a)}>
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {dialog && <AttributeDialog scope={scope} attribute={dialog.attribute} categories={categories} onClose={() => setDialog(null)} />}
      <ConfirmDialog request={confirm} pending={pending} onOpenChange={(open) => !open && setConfirm(null)} />
    </section>
  );
}
