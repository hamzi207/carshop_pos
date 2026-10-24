"use client";

import { createElement, type ReactNode, useMemo, useState } from "react";
import { ChevronDown, ChevronRight, Search, X } from "lucide-react";
import { categoryIcon, type CategoryIndex, type CategoryNode } from "@/lib/categories";
import { categoryImageUrl, colorStyle } from "@/lib/category-colors";

type Props = {
  index: CategoryIndex;
  /** Badges after the name (item counts, "Own", "Hidden"…). */
  renderMeta?: (node: CategoryNode) => ReactNode;
  /** Buttons at the end of the row. */
  renderActions?: (node: CategoryNode) => ReactNode;
  /** Replaces the row, e.g. an inline rename form. */
  renderReplace?: (node: CategoryNode, indent: number) => ReactNode | null;
  /** Shown under the row's children, e.g. an "add subcategory" form. */
  renderBelow?: (node: CategoryNode, indent: number) => ReactNode | null;
  /** Ids kept open regardless of the user's toggles (e.g. the parent being added to). */
  forceOpen?: ReadonlySet<string>;
  /** Extra buttons in the toolbar. */
  toolbar?: ReactNode;
  /** Above the first main category (e.g. a "new main category" form). */
  top?: ReactNode;
  /** Row class for dimmed rows (archived, hidden). */
  dimmed?: (node: CategoryNode) => boolean;
  emptyText?: string;
};

/** Category marker: the image (RF-18.2) or the main category's icon, tinted with the category colour. */
export function CategoryMark({ node, size = 15 }: { node: CategoryNode; size?: number }) {
  const image = categoryImageUrl(node.image_path);
  if (image) {
    // eslint-disable-next-line @next/next/no-img-element -- small public storage image, no optimisation needed
    return <img src={image} alt="" className="cat-mark-image" width={size + 5} height={size + 5} />;
  }
  return (
    <span className={`cat-mark${node.displayColor ? " cat-color" : ""}`} style={colorStyle(node.displayColor)}>
      {createElement(categoryIcon(node), { size })}
    </span>
  );
}

/** A category chip (inventory rows, document search) tinted with the category colour when it has one. */
export function CategoryBadge({ node, label, title }: { node: CategoryNode; label: string; title?: string }) {
  return (
    <span className={`badge${node.displayColor ? " badge-cat" : ""}`} style={colorStyle(node.displayColor)} title={title}>
      {label}
    </span>
  );
}

/** Searchable, collapsible category tree (Settings → Categories, the console's catalog and organization tabs). */
export function CategoryTree({ index, renderMeta, renderActions, renderReplace, renderBelow, forceOpen, toolbar, top, dimmed, emptyText }: Props) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState("");

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

  const row = (node: CategoryNode, indent: number): ReactNode => {
    if (visible && !visible.has(node.id)) return null;
    const below = renderBelow?.(node, indent + 1) ?? null;
    const open = expanded.has(node.id) || Boolean(visible) || Boolean(forceOpen?.has(node.id));
    const hasChildren = node.children.length > 0 || below !== null;
    const replaced = renderReplace?.(node, indent) ?? null;
    return (
      <li key={node.id}>
        {replaced ?? (
          <div className={`cat-manage-row${dimmed?.(node) ? " cat-row-dimmed" : ""}`} style={{ paddingLeft: 8 + indent * 20 }}>
            {hasChildren ? (
              <button type="button" className="cat-toggle" aria-expanded={open} aria-label={`${open ? "Collapse" : "Expand"} ${node.name}`} onClick={() => toggle(node.id)}>
                {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
              </button>
            ) : (
              <span className="cat-toggle-space" />
            )}
            {node.depth === 1 || node.image_path || node.color ? <CategoryMark node={node} /> : null}
            <span className={node.depth === 1 ? "cat-main" : undefined}>{node.name}</span>
            {node.children.length > 0 && <small className="cat-sub-count">{node.children.length} sub</small>}
            {renderMeta?.(node)}
            {renderActions && <span className="row-actions">{renderActions(node)}</span>}
          </div>
        )}
        {open && hasChildren && (
          <ul>
            {node.children.map((child) => row(child, indent + 1))}
            {below && <li>{below}</li>}
          </ul>
        )}
      </li>
    );
  };

  return (
    <>
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
        {toolbar}
      </div>
      <ul className="cat-manage-list">
        {top}
        {index.roots.map((node) => row(node, 0))}
        {visible?.size === 0 && <li className="cat-empty">No category matches “{query.trim()}”.</li>}
        {!visible && index.roots.length === 0 && <li className="cat-empty">{emptyText ?? "No categories yet."}</li>}
      </ul>
    </>
  );
}
