"use client";

import { useMemo, useRef, useState } from "react";
import { Popover } from "radix-ui";
import { Check, ChevronDown, ChevronRight, Layers, Search, X } from "lucide-react";
import { CategoryMark } from "@/components/categories/category-tree";
import { fullPath, pickable, type CategoryIndex, type CategoryNode } from "@/lib/categories";

type Props = {
  index: CategoryIndex;
  value: string | null;
  onChange: (id: string | null) => void;
  /** Filter mode: offers "All categories" and shows item counts. */
  allowAll?: boolean;
  placeholder?: string;
  id?: string;
  invalid?: boolean;
  describedBy?: string;
  disabled?: boolean;
};

/** Main categories, and subcategories with their own colour or image, show their mark (RF-18.2). */
const hasMark = (node: CategoryNode) => node.depth === 1 || Boolean(node.color || node.image_path);

/** Ancestors of the selected category, so the tree opens on it. */
function openPathOf(node: CategoryNode | undefined, index: CategoryIndex) {
  const open = new Set<string>();
  let parent = node?.parent_id ? index.byId.get(node.parent_id) : undefined;
  while (parent) {
    open.add(parent.id);
    parent = parent.parent_id ? index.byId.get(parent.parent_id) : undefined;
  }
  return open;
}

/**
 * Searchable category tree in a popover. Any level can be picked; in filter mode
 * picking a main category or subcategory includes everything below it. Archived
 * categories are left out, except the current value and (in filter mode) ones
 * that still have items.
 */
export function CategoryPicker({ index, value, onChange, allowAll, placeholder = "Choose a category", id, invalid, describedBy, disabled }: Props) {
  const selected = value ? index.byId.get(value) : undefined;
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(() => openPathOf(selected, index));
  const searchRef = useRef<HTMLInputElement>(null);

  const shown = (node: CategoryNode) => pickable(node, value) || (allowAll && node.itemCount > 0);

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return null;
    return index.flat.filter((n) => shown(n) && fullPath(n).toLowerCase().includes(q)).slice(0, 60);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- shown() only reads value and allowAll
  }, [query, index, value, allowAll]);

  const pick = (next: string | null) => {
    onChange(next);
    setOpen(false);
    setQuery("");
  };

  const toggle = (nodeId: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(nodeId)) next.delete(nodeId);
      else next.add(nodeId);
      return next;
    });

  const row = (node: CategoryNode, opts: { indent: number; showPath?: boolean }) => {
    const isOpen = expanded.has(node.id) || Boolean(matches);
    const children = node.children.filter(shown);
    const hasChildren = children.length > 0 && !opts.showPath;
    return (
      <li key={node.id}>
        <div className={`cat-row${node.id === value ? " selected" : ""}`} style={{ paddingLeft: 6 + opts.indent * 16 }}>
          {hasChildren ? (
            <button
              type="button"
              className="cat-toggle"
              aria-label={`${isOpen ? "Collapse" : "Expand"} ${node.name}`}
              aria-expanded={isOpen}
              onClick={() => toggle(node.id)}
            >
              {isOpen ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
            </button>
          ) : (
            <span className="cat-toggle-space" />
          )}
          <button type="button" aria-pressed={node.id === value} className="cat-pick" onClick={() => pick(node.id)}>
            {hasMark(node) && <CategoryMark node={node} size={13} />}
            <span className={node.depth === 1 ? "cat-main" : undefined}>
              {opts.showPath ? fullPath(node) : node.name}
            </span>
            {allowAll && <small>{node.itemCount}</small>}
            {node.id === value && <Check size={13} className="cat-check" />}
          </button>
        </div>
        {hasChildren && isOpen && (
          <ul>{children.map((child) => row(child, { indent: opts.indent + 1 }))}</ul>
        )}
      </li>
    );
  };

  const total = index.roots.reduce((sum, n) => sum + n.itemCount, 0);

  return (
    <Popover.Root
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) setExpanded((prev) => new Set([...prev, ...openPathOf(selected, index)]));
        else setQuery("");
      }}
    >
      <Popover.Trigger asChild>
        <button
          type="button"
          id={id}
          className={`cat-trigger${selected ? " has-value" : ""}`}
          data-invalid={invalid || undefined}
          aria-describedby={describedBy}
          disabled={disabled}
          title={selected ? fullPath(selected) : undefined}
        >
          {selected ? <CategoryMark node={selected} size={13} /> : <Layers size={14} />}
          <span>{selected ? fullPath(selected) : allowAll ? "All categories" : placeholder}</span>
          <ChevronDown size={14} className="range-chevron" />
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          className="cat-panel"
          align="start"
          sideOffset={6}
          collisionPadding={16}
          onOpenAutoFocus={(e) => {
            e.preventDefault();
            searchRef.current?.focus();
          }}
        >
          <div className="cat-search">
            <Search size={14} />
            <input
              ref={searchRef}
              type="search"
              value={query}
              placeholder="Find a category…"
              aria-label="Find a category"
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  if (matches?.[0]) pick(matches[0].id);
                }
              }}
            />
            {query && (
              <button type="button" className="search-clear" aria-label="Clear" onClick={() => setQuery("")}>
                <X size={13} />
              </button>
            )}
          </div>
          <ul className="cat-list" aria-label="Categories">
            {allowAll && !matches && (
              <li>
                <div className={`cat-row${value ? "" : " selected"}`} style={{ paddingLeft: 6 }}>
                  <span className="cat-toggle-space" />
                  <button type="button" aria-pressed={!value} className="cat-pick" onClick={() => pick(null)}>
                    <Layers size={14} />
                    <span className="cat-main">All categories</span>
                    <small>{total}</small>
                    {!value && <Check size={13} className="cat-check" />}
                  </button>
                </div>
              </li>
            )}
            {matches
              ? matches.map((node) => row(node, { indent: 0, showPath: true }))
              : index.roots.filter(shown).map((node) => row(node, { indent: 0 }))}
            {matches?.length === 0 && <li className="cat-empty">No category matches “{query.trim()}”.</li>}
            {!matches && index.roots.length === 0 && (
              <li className="cat-empty">No categories yet. Request one from Settings → Categories.</li>
            )}
          </ul>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
