"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Box, Loader2, PenLine, Plus, Search } from "lucide-react";
import { formatMoney, type MoneyFormat } from "@/lib/format";
import type { PickerItem, PickerItemsResponse } from "@/lib/types/quote";

type Props = {
  money: MoneyFormat;
  /** Inventory ids already on the document (adding again adds 1 to the quantity). */
  addedIds: ReadonlySet<string>;
  onAdd: (item: PickerItem) => void;
  /** A line for something not in inventory, with this description. */
  onAddCustom: (description: string) => void;
};

/** Available = on hand − reserved on open quotations. */
function Stock({ item }: { item: PickerItem }) {
  const available = item.quantity_on_hand - item.reserved_quantity;
  const reserved = item.reserved_quantity > 0 ? ` · ${item.reserved_quantity} reserved` : "";
  const tone = available <= 0 ? "stock-out" : available <= item.low_stock_threshold ? "stock-low" : "in-stock";
  return <span className={tone}>{available <= 0 ? "None available" : `${available} available`}{reserved}</span>;
}

/**
 * Search box at the top of the line items: type a name or SKU, click a part
 * to add it. Anything not in inventory can be added as a custom item.
 */
export function LineSearch({ money, addedIds, onAdd, onAddCustom }: Props) {
  const listId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [result, setResult] = useState<{ request: string; items: PickerItem[]; error: string | null }>({
    request: "",
    items: [],
    error: null,
  });

  const q = query.trim();
  const request = `/api/quote-items${q ? `?q=${encodeURIComponent(q)}` : ""}`;

  useEffect(() => {
    if (!open) return;
    const ctrl = new AbortController();
    const timer = setTimeout(() => {
      fetch(request, { signal: ctrl.signal })
        .then(async (res) => {
          if (!res.ok) throw new Error("Couldn't load parts.");
          const body = (await res.json()) as PickerItemsResponse;
          setResult({ request, items: body.items, error: null });
          setActive(0);
        })
        .catch((err) => !ctrl.signal.aborted && setResult({ request, items: [], error: err.message }));
    }, 200);
    return () => {
      clearTimeout(timer);
      ctrl.abort();
    };
  }, [open, request]);

  const loading = open && result.request !== request;
  const items = result.items;
  // The last option adds the typed text as a custom item.
  const optionCount = items.length + 1;

  // Close the menu so the new line isn't hidden under it; typing reopens it.
  const add = (item: PickerItem) => {
    onAdd(item);
    setQuery("");
    setOpen(false);
  };
  const addCustom = () => {
    onAddCustom(q);
    setQuery("");
    setOpen(false);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setOpen(true);
      setActive((i) => Math.min(i + 1, optionCount - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter" && open) {
      e.preventDefault();
      if (active < items.length) add(items[active]);
      else addCustom();
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  };

  return (
    <div className="line-search">
      <div className="line-search-box">
        {loading ? <Loader2 size={16} className="animate-spin" /> : <Search size={16} />}
        <input
          ref={inputRef}
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={open ? `${listId}-${active}` : undefined}
          aria-label="Search parts to add"
          placeholder="Search parts by name or SKU, then click to add…"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          onKeyDown={onKeyDown}
          maxLength={100}
        />
        <button type="button" className="button" onClick={() => onAddCustom("")}>
          <PenLine size={14} /> Custom item
        </button>
      </div>
      {open && (
        <ul id={listId} role="listbox" aria-label="Parts" className="line-search-menu">
          {items.map((item, i) => (
            <li
              key={item.id}
              id={`${listId}-${i}`}
              role="option"
              aria-selected={i === active}
              className={i === active ? "active" : ""}
              onMouseDown={(e) => e.preventDefault()}
              onMouseEnter={() => setActive(i)}
              onClick={() => add(item)}
            >
              <span className="product-thumbnail"><Box size={15} /></span>
              <span className="line-search-info">
                <strong className="product-title">{item.name}</strong>
                <span><span className="mono">{item.sku}</span> · {item.category?.name ?? "Uncategorised"} · <Stock item={item} /></span>
              </span>
              <span className="line-search-price">
                {formatMoney(item.selling_price, money)}
                {addedIds.has(item.id) && <small>On this document · adds 1</small>}
              </span>
            </li>
          ))}
          {!loading && items.length === 0 && (
            <li className="line-search-empty" role="presentation">{result.error ?? (q ? "No parts match." : "No parts in inventory yet.")}</li>
          )}
          <li
            id={`${listId}-${items.length}`}
            role="option"
            aria-selected={active === items.length}
            className={`line-search-custom${active === items.length ? " active" : ""}`}
            onMouseDown={(e) => e.preventDefault()}
            onMouseEnter={() => setActive(items.length)}
            onClick={addCustom}
          >
            <Plus size={14} />
            {q ? <>Add “{q}” as a custom item (not in inventory)</> : "Add a custom item (not in inventory)"}
          </li>
        </ul>
      )}
    </div>
  );
}
