"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import {
  Archive,
  ArchiveRestore,
  ArrowDown,
  ArrowUp,
  Eye,
  EyeOff,
  FolderInput,
  FolderPlus,
  FolderTree,
  ImagePlus,
  Loader2,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react";
import { CategoryMark, CategoryTree } from "@/components/categories/category-tree";
import { SubscriptionDialog as FormDialog, useSubmit } from "@/components/subscription/subscription-dialog";
import {
  createCategory,
  deleteCategory,
  moveCategory,
  removeCategoryImage,
  reorderCategory,
  saveCategoryDetails,
  setCategoryArchived,
  setCategoryHidden,
  uploadCategoryImage,
  type CategoryScope,
} from "@/lib/actions/admin-categories";
import type { AdminActionResult } from "@/lib/actions/admin";
import { buildCategoryIndex, descendantIds, fullPath, MAX_CATEGORY_DEPTH, type Category, type CategoryIndex, type CategoryNode } from "@/lib/categories";
import { CATEGORY_COLORS, categoryImageUrl, COLOR_KEYS } from "@/lib/category-colors";
import { CATEGORY_ICONS, ICON_NAMES } from "@/lib/category-icons";
import { notify } from "@/lib/notify";

type Props = {
  /** An industry's catalog, or one organization's tree (its industry's catalog + its own categories). */
  scope: CategoryScope;
  categories: Category[];
  /** Items directly on each category (every organization for a catalog; this organization's otherwise). */
  counts: Record<string, number>;
  /** Catalog: organizations using each category. */
  orgs?: Record<string, number>;
  /** Organization: catalog categories hidden for it. */
  hiddenIds?: string[];
  /** Card heading (default "Catalog" / "Categories"). */
  title?: string;
};

type Dialog =
  | { kind: "add"; parent: CategoryNode | null }
  | { kind: "details"; node: CategoryNode }
  | { kind: "move"; node: CategoryNode };

// ---------------------------------------------------------------------------

function AddDialog({ scope, parent, onClose }: { scope: CategoryScope; parent: CategoryNode | null; onClose: () => void }) {
  const [name, setName] = useState("");
  const { busy, error, run } = useSubmit(onClose, "Category added");
  const own = "tenantId" in scope;
  return (
    <FormDialog
      open
      onClose={onClose}
      icon={FolderPlus}
      title={parent ? `Add under ${parent.name}` : "Add a main category"}
      description={
        own
          ? `Only this organization sees it${parent ? `, under ${fullPath(parent)}` : ""}.`
          : `Every organization in this industry sees it${parent ? `, under ${fullPath(parent)}` : ""}.`
      }
      submitLabel="Add"
      busy={busy}
      error={error}
      onSubmit={() => void run(() => createCategory(scope, parent?.id ?? null, name))}
    >
      <label className="span-two">
        <span>NAME</span>
        <input autoFocus value={name} maxLength={60} onChange={(e) => setName(e.target.value)} />
      </label>
    </FormDialog>
  );
}

function DetailsDialog({ node, onClose }: { node: CategoryNode; onClose: () => void }) {
  const [v, setV] = useState({ name: node.name, skuPrefix: node.sku_prefix ?? "", icon: node.icon ?? "", color: node.color ?? "" });
  const { busy, error, setError, run } = useSubmit(onClose, "Category saved");
  const [uploading, startUpload] = useTransition();
  const file = useRef<HTMLInputElement>(null);
  const main = node.depth === 1;
  const image = categoryImageUrl(node.image_path);

  const upload = (f: File | undefined) => {
    if (!f) return;
    // A new pick replaces the last one's message.
    setError(null);
    if (f.size > 1024 * 1024) return setError("Images can be at most 1 MB.");
    const form = new FormData();
    form.set("file", f);
    startUpload(async () => {
      const result = await uploadCategoryImage(node.id, form);
      if (result.status === "error") setError(result.message);
      else notify.success("Image saved");
    });
  };

  return (
    <FormDialog
      open
      onClose={onClose}
      icon={Pencil}
      title="Edit category"
      description={fullPath(node)}
      submitLabel="Save"
      busy={busy || uploading}
      error={error}
      onSubmit={() => void run(() => saveCategoryDetails(node.id, v))}
    >
      <label className={main ? undefined : "span-two"}>
        <span>NAME</span>
        <input value={v.name} maxLength={60} onChange={(e) => setV({ ...v, name: e.target.value })} />
      </label>
      {main && (
        <label>
          <span>SKU PREFIX</span>
          <input value={v.skuPrefix} maxLength={6} placeholder={node.name.replace(/[^A-Za-z0-9]/g, "").slice(0, 3).toUpperCase()} onChange={(e) => setV({ ...v, skuPrefix: e.target.value.toUpperCase() })} />
          <small>“Generate SKU” for everything in this category.</small>
        </label>
      )}
      {main && (
        <div className="span-two">
          <span className="field-label">ICON</span>
          <div className="icon-picker" role="radiogroup" aria-label="Icon">
            {ICON_NAMES.map((name) => {
              const Icon = CATEGORY_ICONS[name];
              return (
                <button
                  key={name}
                  type="button"
                  role="radio"
                  aria-checked={v.icon === name}
                  className={v.icon === name ? "is-on" : undefined}
                  title={name}
                  aria-label={name}
                  onClick={() => setV({ ...v, icon: v.icon === name ? "" : name })}
                >
                  <Icon size={16} />
                </button>
              );
            })}
          </div>
        </div>
      )}
      <div className="span-two">
        <span className="field-label">COLOUR</span>
        <div className="swatch-picker" role="radiogroup" aria-label="Colour">
          <button type="button" role="radio" aria-checked={v.color === ""} className={`swatch swatch-none${v.color === "" ? " is-on" : ""}`} title="None" aria-label="No colour" onClick={() => setV({ ...v, color: "" })} />
          {COLOR_KEYS.map((key) => (
            <button
              key={key}
              type="button"
              role="radio"
              aria-checked={v.color === key}
              className={`swatch${v.color === key ? " is-on" : ""}`}
              style={{ background: CATEGORY_COLORS[key] }}
              title={key}
              aria-label={key}
              onClick={() => setV({ ...v, color: key })}
            />
          ))}
        </div>
        <small>Subcategories without their own colour use this one.</small>
      </div>
      <div className="span-two cat-image-field">
        <span className="field-label">IMAGE</span>
        <div>
          {image ? (
            // eslint-disable-next-line @next/next/no-img-element -- small public storage image
            <img src={image} alt="" width={48} height={48} />
          ) : (
            <span className="cat-image-empty"><CategoryMark node={node} size={20} /></span>
          )}
          <input ref={file} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={(e) => upload(e.target.files?.[0])} />
          <button type="button" className="button" disabled={uploading} onClick={() => file.current?.click()}>
            {uploading ? <Loader2 size={14} className="animate-spin" /> : <ImagePlus size={14} />} {image ? "Replace" : "Upload"}
          </button>
          {image && (
            <button
              type="button"
              className="button"
              disabled={uploading}
              onClick={() =>
                startUpload(async () => {
                  const result = await removeCategoryImage(node.id);
                  if (result.status === "error") setError(result.message);
                })
              }
            >
              Remove
            </button>
          )}
        </div>
        <small>PNG, JPG or WebP, at most 1 MB. Shown instead of the icon in pickers and chips. Saved at once.</small>
      </div>
    </FormDialog>
  );
}

function MoveDialog({ index, node, onClose }: { index: CategoryIndex; node: CategoryNode; onClose: () => void }) {
  const [parentId, setParentId] = useState(node.parent_id ?? "");
  const { busy, error, run } = useSubmit(onClose, "Category moved");
  // Not into itself or below itself, and the moved branch must still fit in 4 levels.
  const below = new Set(descendantIds(node));
  const height = (n: CategoryNode): number => 1 + Math.max(0, ...n.children.map(height));
  const h = height(node);
  // Only parents in the same tree part: catalog rows under catalog rows; an organization's own anywhere it can reach.
  const choices = index.flat.filter((p) => !below.has(p.id) && p.depth + h <= MAX_CATEGORY_DEPTH && (node.tenant_id ? true : !p.tenant_id));
  return (
    <FormDialog
      open
      onClose={onClose}
      icon={FolderInput}
      title={`Move ${node.name}`}
      description="Everything below it moves too. Items keep their category."
      submitLabel="Move"
      busy={busy}
      error={error}
      onSubmit={() => void run(() => moveCategory(node.id, parentId || null))}
    >
      <label className="span-two">
        <span>NEW PARENT</span>
        <select value={parentId} onChange={(e) => setParentId(e.target.value)}>
          <option value="">Nothing (a main category)</option>
          {choices.map((p) => (
            <option key={p.id} value={p.id}>{fullPath(p)}</option>
          ))}
        </select>
      </label>
    </FormDialog>
  );
}

// ---------------------------------------------------------------------------

/**
 * The console's category tree editor (Phase 18, deliverables 3 and 4). For an industry: its catalog. For an
 * organization: its industry's catalog (hide / show per organization, add its own categories anywhere) plus
 * its own categories (full editing).
 */
export function CategoryCatalogEditor({ scope, categories, counts, orgs, hiddenIds = [], title }: Props) {
  const index = useMemo(() => buildCategoryIndex(categories, counts), [categories, counts]);
  const hidden = useMemo(() => new Set(hiddenIds), [hiddenIds]);
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const [pending, startTransition] = useTransition();
  const forOrg = "tenantId" in scope;
  const ownCount = categories.filter((c) => c.tenant_id).length;

  const act = (fn: () => Promise<AdminActionResult>, done: string, fail: string) =>
    startTransition(async () => {
      const result = await fn();
      if (result.status === "error") notify.error(fail, result.message);
      else notify.success(done, result.message);
    });

  const siblingsOf = (n: CategoryNode) => (n.parent_id ? (index.byId.get(n.parent_id)?.children ?? []) : index.roots);

  const actions = (node: CategoryNode) => {
    const editable = forOrg ? Boolean(node.tenant_id) : true;
    const siblings = siblingsOf(node);
    const at = siblings.indexOf(node);
    const isHidden = hidden.has(node.id);
    const canDelete = node.itemCount === 0 && node.children.length === 0 && !(orgs?.[node.id] ?? 0);
    return (
      <>
        {node.depth < MAX_CATEGORY_DEPTH && !node.archived && !isHidden && (
          <button type="button" className="icon-button" title={forOrg && !node.tenant_id ? "Add an own subcategory" : "Add subcategory"} aria-label={`Add a subcategory to ${node.name}`} onClick={() => setDialog({ kind: "add", parent: node })}>
            <Plus size={15} />
          </button>
        )}
        {forOrg && !node.tenant_id && (
          <button
            type="button"
            className="icon-button"
            title={isHidden ? "Show to this organization" : "Hide from this organization"}
            aria-label={`${isHidden ? "Show" : "Hide"} ${node.name}`}
            disabled={pending}
            onClick={() => act(() => setCategoryHidden("tenantId" in scope ? scope.tenantId : "", node.id, !isHidden), isHidden ? "Category shown" : "Category hidden", "Not changed")}
          >
            {isHidden ? <Eye size={15} /> : <EyeOff size={15} />}
          </button>
        )}
        {editable && (
          <>
            <button type="button" className="icon-button" title="Move up" aria-label={`Move ${node.name} up`} disabled={pending || at <= 0} onClick={() => act(() => reorderCategory(node.id, "up"), "Order saved", "Not moved")}>
              <ArrowUp size={14} />
            </button>
            <button type="button" className="icon-button" title="Move down" aria-label={`Move ${node.name} down`} disabled={pending || at >= siblings.length - 1} onClick={() => act(() => reorderCategory(node.id, "down"), "Order saved", "Not moved")}>
              <ArrowDown size={14} />
            </button>
            <button type="button" className="icon-button" title="Edit (name, prefix, icon, colour, image)" aria-label={`Edit ${node.name}`} onClick={() => setDialog({ kind: "details", node })}>
              <Pencil size={14} />
            </button>
            <button type="button" className="icon-button" title="Move to another parent" aria-label={`Move ${node.name}`} onClick={() => setDialog({ kind: "move", node })}>
              <FolderInput size={14} />
            </button>
            {node.is_archived ? (
              <button type="button" className="icon-button" title="Restore" aria-label={`Restore ${node.name}`} disabled={pending} onClick={() => act(() => setCategoryArchived(node.id, false), "Category restored", "Not restored")}>
                <ArchiveRestore size={14} />
              </button>
            ) : (
              !node.archived && (
                <button
                  type="button"
                  className="icon-button"
                  title="Archive: hidden from pickers, kept on items and documents"
                  aria-label={`Archive ${node.name}`}
                  disabled={pending}
                  onClick={() => act(() => setCategoryArchived(node.id, true), "Category archived", "Not archived")}
                >
                  <Archive size={14} />
                </button>
              )
            )}
            <button
              type="button"
              className="icon-button danger"
              title={canDelete ? "Delete" : node.children.length ? "Has subcategories" : "In use: archive it instead"}
              aria-label={`Delete ${node.name}`}
              disabled={pending || !canDelete}
              onClick={() => act(() => deleteCategory(node.id), "Category deleted", "Not deleted")}
            >
              <Trash2 size={14} />
            </button>
          </>
        )}
      </>
    );
  };

  return (
    <section className="card settings-card category-manager">
      <div className="settings-card-head">
        <span className="header-icon blue"><FolderTree size={18} /></span>
        <div>
          <h2>{title ?? (forOrg ? "Categories" : "Catalog")}</h2>
          <p>
            {index.flat.length} categories{forOrg ? `, ${ownCount} of them this organization's own, ${hidden.size} hidden` : ""}. At most 4 levels.
            {forOrg
              ? " Catalog categories come from the industry; hide the ones it doesn't use, or add its own anywhere."
              : " Categories in use can be archived (kept on items and documents) but not deleted."}
          </p>
        </div>
        {pending && <Loader2 size={15} className="animate-spin" />}
      </div>
      <CategoryTree
        index={index}
        dimmed={(n) => n.archived || hidden.has(n.id)}
        renderMeta={(node) => (
          <>
            {node.tenant_id && forOrg && <span className="badge badge-purple">Own</span>}
            {hidden.has(node.id) && <span className="badge badge-muted">Hidden</span>}
            {node.is_archived && <span className="badge badge-muted">Archived</span>}
            {node.depth === 1 && node.sku_prefix && <span className="badge badge-blue">{node.sku_prefix}</span>}
            {orgs && (orgs[node.id] ?? 0) > 0 && <small className="cat-sub-count">{orgs[node.id]} orgs</small>}
            <span className={`badge${node.itemCount ? "" : " badge-muted"}`}>
              {node.itemCount} {node.itemCount === 1 ? "item" : "items"}
            </span>
          </>
        )}
        renderActions={actions}
        toolbar={
          <button type="button" className="button button-primary" onClick={() => setDialog({ kind: "add", parent: null })}>
            <Plus size={14} /> {forOrg ? "Own main category" : "Main category"}
          </button>
        }
        emptyText={forOrg ? "No categories." : "This catalog is empty. Add a main category, duplicate another industry's tree, or import a CSV."}
      />
      {dialog?.kind === "add" && <AddDialog scope={scope} parent={dialog.parent} onClose={() => setDialog(null)} />}
      {dialog?.kind === "details" && <DetailsDialog node={index.byId.get(dialog.node.id) ?? dialog.node} onClose={() => setDialog(null)} />}
      {dialog?.kind === "move" && <MoveDialog index={index} node={dialog.node} onClose={() => setDialog(null)} />}
    </section>
  );
}
