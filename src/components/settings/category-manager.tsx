"use client";

import { useMemo, useState } from "react";
import { Check, ChevronDown, ChevronRight, FolderTree, Loader2, Pencil, Plus, Search, Trash2, X } from "lucide-react";
import { createCategory, deleteCategory, renameCategory, type CategoryActionResult } from "@/lib/actions/categories";
import { buildCategoryIndex, categoryIcon, fullPath, MAX_CATEGORY_DEPTH, type Category, type CategoryNode } from "@/lib/categories";
import { notify } from "@/lib/notify";

type Props = {
  categories: Category[];
  /** Items per category id. */
  counts: Record<string, number>;
  /** Staff see the list but can't change it. */
  canEdit: boolean;
};

/** Settings → Product categories: the shop's category tree (docs/categories.md), editable by admins. */
export function CategoryManager({ categories, counts, canEdit }: Props) {
  const index = useMemo(() => buildCategoryIndex(categories, counts), [categories, counts]);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState("");
  // What is being edited: a rename (id), or a new category under a parent ("root" = main category).
  const [editing, setEditing] = useState<{ mode: "rename" | "add"; id: string } | null>(null);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);

  const q = query.trim().toLowerCase();
  // While searching, show matches plus their ancestors (so the tree still reads).
  const visible = useMemo(() => {
    if (!q) return null;
    const keep = new Set<string>();
    for (const node of index.flat) {
      if (!node.name.toLowerCase().includes(q)) continue;
      let cur: CategoryNode | undefined = node;
      while (cur) {
        keep.add(cur.id);
        cur = cur.parent_id ? index.byId.get(cur.parent_id) : undefined;
      }
    }
    return keep;
  }, [q, index]);

  const toggle = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const start = (mode: "rename" | "add", id: string, initial = "") => {
    setEditing({ mode, id });
    setDraft(initial);
    if (mode === "add" && id !== "root") setExpanded((prev) => new Set(prev).add(id));
  };
  const cancel = () => {
    setEditing(null);
    setDraft("");
  };

  const run = async (action: () => Promise<CategoryActionResult>, ok: () => [string, string]) => {
    setBusy(true);
    const result = await action();
    setBusy(false);
    if (result.status === "error") {
      notify.error("Category not saved", result.message);
      return false;
    }
    const [title, description] = ok();
    notify.success(title, description);
    return true;
  };

  const submit = async () => {
    if (!editing) return;
    const name = draft.trim();
    if (editing.mode === "rename") {
      const node = index.byId.get(editing.id);
      if (!node || name === node.name) return cancel();
      if (await run(() => renameCategory(editing.id, name), () => ["Category renamed", `“${node.name}” is now “${name}”. Items in it keep their category.`])) cancel();
    } else {
      const parent = editing.id === "root" ? undefined : index.byId.get(editing.id);
      const where = parent ? `under ${fullPath(parent)}` : "as a main category";
      if (await run(() => createCategory({ name, parentId: parent?.id ?? null }), () => ["Category added", `“${name}” added ${where}.`])) cancel();
    }
  };

  const remove = (node: CategoryNode) =>
    run(() => deleteCategory(node.id), () => ["Category deleted", `“${fullPath(node)}” was removed.`]);

  const editor = (placeholder: string, indent: number) => (
    <form
      className="cat-editor"
      style={{ paddingLeft: 8 + indent * 20 }}
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      <input
        autoFocus
        value={draft}
        maxLength={60}
        placeholder={placeholder}
        aria-label={placeholder}
        className="settings-input"
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => e.key === "Escape" && cancel()}
      />
      <button type="submit" className="button button-primary" disabled={busy || !draft.trim()}>
        {busy ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />} Save
      </button>
      <button type="button" className="icon-button" aria-label="Cancel" onClick={cancel}>
        <X size={15} />
      </button>
    </form>
  );

  const row = (node: CategoryNode, indent: number) => {
    if (visible && !visible.has(node.id)) return null;
    const open = expanded.has(node.id) || Boolean(visible);
    const hasChildren = node.children.length > 0;
    const Icon = node.depth === 1 ? categoryIcon(node) : null;
    const blocked = node.itemCount > 0 ? "Has items: move them to another category first." : hasChildren ? "Has subcategories: delete them first." : null;
    const renaming = editing?.mode === "rename" && editing.id === node.id;
    const addingHere = editing?.mode === "add" && editing.id === node.id;
    return (
      <li key={node.id}>
        {renaming ? (
          editor("Category name", indent)
        ) : (
          <div className="cat-manage-row" style={{ paddingLeft: 8 + indent * 20 }}>
            {hasChildren || addingHere ? (
              <button type="button" className="cat-toggle" aria-expanded={open} aria-label={`${open ? "Collapse" : "Expand"} ${node.name}`} onClick={() => toggle(node.id)}>
                {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
              </button>
            ) : (
              <span className="cat-toggle-space" />
            )}
            {Icon && <Icon size={15} className="cat-manage-icon" />}
            <span className={node.depth === 1 ? "cat-main" : undefined}>{node.name}</span>
            {hasChildren && <small className="cat-sub-count">{node.children.length} sub</small>}
            <span className={`badge${node.itemCount ? "" : " badge-muted"}`}>
              {node.itemCount} {node.itemCount === 1 ? "item" : "items"}
            </span>
            {canEdit && (
              <span className="row-actions">
                {node.depth < MAX_CATEGORY_DEPTH && (
                  <button type="button" className="icon-button" aria-label={`Add a subcategory to ${node.name}`} title="Add subcategory" onClick={() => start("add", node.id)}>
                    <Plus size={15} />
                  </button>
                )}
                <button type="button" className="icon-button" aria-label={`Rename ${node.name}`} title="Rename" onClick={() => start("rename", node.id, node.name)}>
                  <Pencil size={14} />
                </button>
                <button
                  type="button"
                  className="icon-button danger"
                  aria-label={`Delete ${node.name}`}
                  title={blocked ?? "Delete"}
                  disabled={Boolean(blocked) || busy}
                  onClick={() => void remove(node)}
                >
                  <Trash2 size={14} />
                </button>
              </span>
            )}
          </div>
        )}
        {(open || addingHere) && (hasChildren || addingHere) && (
          <ul>
            {node.children.map((child) => row(child, indent + 1))}
            {addingHere && <li>{editor(`New subcategory in ${node.name}`, indent + 1)}</li>}
          </ul>
        )}
      </li>
    );
  };

  return (
    <section className="card settings-card category-manager">
      <div className="settings-card-head">
        <span className="header-icon blue"><FolderTree size={18} /></span>
        <div>
          <h2>Product categories</h2>
          <p>
            {index.roots.length} main categories · {index.flat.length} in total. Items can use any level; inventory
            filters include everything below the chosen category.
          </p>
        </div>
      </div>
      {!canEdit && <div className="form-alert form-alert-info cat-staff-note" role="status">Only shop admins can change categories.</div>}
      <div className="cat-manage-toolbar">
        <div className="inventory-search">
          <Search size={15} />
          <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Find a category…" aria-label="Find a category" />
          {query && (
            <button type="button" className="search-clear" aria-label="Clear" onClick={() => setQuery("")}>
              <X size={13} />
            </button>
          )}
        </div>
        <button
          type="button"
          className="button"
          onClick={() => setExpanded(expanded.size ? new Set() : new Set(index.flat.filter((n) => n.children.length).map((n) => n.id)))}
        >
          {expanded.size ? "Collapse all" : "Expand all"}
        </button>
        {canEdit && (
          <button type="button" className="button button-primary" onClick={() => start("add", "root")}>
            <Plus size={14} /> Main category
          </button>
        )}
      </div>
      <ul className="cat-manage-list">
        {editing?.mode === "add" && editing.id === "root" && <li>{editor("New main category", 0)}</li>}
        {index.roots.map((node) => row(node, 0))}
        {visible?.size === 0 && <li className="cat-empty">No category matches “{query.trim()}”.</li>}
      </ul>
    </section>
  );
}
