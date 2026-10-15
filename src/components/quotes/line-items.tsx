"use client";

import { ArrowDown, ArrowUp, Minus, Plus, Trash2 } from "lucide-react";
import { formatMoney, type MoneyFormat } from "@/lib/format";
import { lineAmounts, round2, unitDiscount, type DiscountType } from "@/lib/quote-math";
import type { PickerItem } from "@/lib/types/quote";
import { LineSearch } from "./line-search";

/** One line in the builder. `key` is local only (React list key). */
export type BuilderLine = {
  key: string;
  /** Inventory part, or null for a custom item that isn't in inventory. */
  itemId: string | null;
  sku: string | null;
  description: string;
  /** Older labour lines; treated like custom items. */
  isLabor: boolean;
  quantity: number;
  /** Inventory parts: the catalogue price (read-only). Custom items: as entered. */
  unitPrice: number;
  priceIncludesTax: boolean;
  /** Per unit: % of the unit price or a flat amount. */
  discountType: DiscountType;
  discountValue: number;
  /** Units this part line can use: available stock (+ what a saved line already holds). Null for custom items. */
  stock: number | null;
};

type Props = {
  lines: BuilderLine[];
  onChange: (lines: BuilderLine[]) => void;
  onAdd: (item: PickerItem) => void;
  onAddCustom: (description: string) => void;
  money: MoneyFormat;
  readOnly: boolean;
};

const numberValue = (n: number) => (Number.isFinite(n) ? n : "");

/**
 * Line items with the search box on top. Columns: qty, unit price (fixed for
 * inventory parts), discount (% or Rs.), sale price, line total. Editing the
 * discount updates the sale price; editing the sale price sets a flat
 * (Rs.) discount. Line total = qty × sale price.
 */
export function LineItems({ lines, onChange, onAdd, onAddCustom, money, readOnly }: Props) {
  const update = (key: string, patch: Partial<BuilderLine>) =>
    onChange(lines.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  const remove = (key: string) => onChange(lines.filter((l) => l.key !== key));
  const move = (index: number, by: -1 | 1) => {
    const next = [...lines];
    [next[index], next[index + by]] = [next[index + by], next[index]];
    onChange(next);
  };
  const addedIds = new Set(lines.flatMap((l) => (l.itemId ? [l.itemId] : [])));

  return (
    <section className="card doc-lines">
      <div className="card-header">
        <div>
          <h2>Line items</h2>
          <p>
            {lines.length === 0
              ? "Search for a part to add it, or add a custom item that isn't in your inventory."
              : `${lines.length} ${lines.length === 1 ? "line" : "lines"}`}
          </p>
        </div>
      </div>
      {!readOnly && <LineSearch money={money} addedIds={addedIds} onAdd={onAdd} onAddCustom={onAddCustom} />}

      {lines.length > 0 && (
        <div className="doc-table" role="table" aria-label="Line items">
          <div className="doc-row doc-head" role="row">
            <span role="columnheader">#</span>
            <span role="columnheader">ITEM</span>
            <span role="columnheader">QTY</span>
            <span role="columnheader">UNIT PRICE</span>
            <span role="columnheader">DISCOUNT</span>
            <span role="columnheader">SALE PRICE</span>
            <span role="columnheader">TOTAL</span>
            <span role="columnheader"><span className="sr-only">Actions</span></span>
          </div>
          {lines.map((line, i) => {
            const custom = line.itemId === null;
            const amounts = lineAmounts(line);
            const sale = round2(line.unitPrice - unitDiscount(line));
            const short = !custom && line.stock !== null && line.quantity > line.stock;
            return (
              <div className="doc-row" role="row" key={line.key}>
                <span className="doc-index">
                  {i + 1}
                  {!readOnly && (
                    <span className="line-move">
                      <button type="button" aria-label="Move up" disabled={i === 0} onClick={() => move(i, -1)}>
                        <ArrowUp size={10} />
                      </button>
                      <button type="button" aria-label="Move down" disabled={i === lines.length - 1} onClick={() => move(i, 1)}>
                        <ArrowDown size={10} />
                      </button>
                    </span>
                  )}
                </span>

                <div className="line-desc">
                  {custom ? (
                    <>
                      <input
                        className="line-input"
                        value={line.description}
                        onChange={(e) => update(line.key, { description: e.target.value })}
                        placeholder="Describe the item or service"
                        aria-label="Custom item description"
                        maxLength={300}
                        readOnly={readOnly}
                      />
                      <span className="line-tag">Custom item · not in inventory</span>
                    </>
                  ) : (
                    <>
                      <strong className="product-title" title={line.description}>{line.description}</strong>
                      <span className="mono">{line.sku ?? "Removed from inventory"}</span>
                      {short && (
                        <span className="stock-low">{line.stock! <= 0 ? "None available" : `Only ${line.stock} available`}</span>
                      )}
                    </>
                  )}
                </div>

                {custom ? (
                  <input
                    className="line-input number"
                    type="number"
                    inputMode="decimal"
                    min="0.01"
                    step="any"
                    value={numberValue(line.quantity)}
                    onChange={(e) => update(line.key, { quantity: e.target.valueAsNumber })}
                    aria-label="Quantity"
                    readOnly={readOnly}
                  />
                ) : (
                  <div className="stepper">
                    <button
                      type="button"
                      aria-label="Decrease quantity"
                      disabled={readOnly || line.quantity <= 1}
                      onClick={() => update(line.key, { quantity: Math.max(1, Math.floor(line.quantity) - 1) })}
                    >
                      <Minus size={11} />
                    </button>
                    <input
                      type="number"
                      inputMode="numeric"
                      min="1"
                      step="1"
                      value={numberValue(line.quantity)}
                      onChange={(e) => update(line.key, { quantity: e.target.valueAsNumber })}
                      aria-label="Quantity"
                      readOnly={readOnly}
                    />
                    <button
                      type="button"
                      aria-label="Increase quantity"
                      disabled={readOnly}
                      onClick={() => update(line.key, { quantity: Math.floor(line.quantity || 0) + 1 })}
                    >
                      <Plus size={11} />
                    </button>
                  </div>
                )}

                {custom ? (
                  <input
                    className="line-input number"
                    type="number"
                    inputMode="decimal"
                    min="0"
                    step="0.01"
                    value={numberValue(line.unitPrice)}
                    onChange={(e) => update(line.key, { unitPrice: e.target.valueAsNumber })}
                    aria-label="Unit price"
                    readOnly={readOnly}
                  />
                ) : (
                  <span className="line-unit" title="Price from inventory">{formatMoney(line.unitPrice, money)}</span>
                )}

                <div className={`line-discount${amounts.invalid ? " invalid" : ""}`}>
                  <button
                    type="button"
                    disabled={readOnly}
                    onClick={() => update(line.key, { discountType: line.discountType === "percent" ? "amount" : "percent", discountValue: 0 })}
                    aria-label={`Discount in ${line.discountType === "percent" ? "percent" : money.currency}; click to switch`}
                    title="Switch between % and a flat amount per unit"
                  >
                    {line.discountType === "percent" ? "%" : money.currency}
                  </button>
                  <input
                    type="number"
                    inputMode="decimal"
                    min="0"
                    max={line.discountType === "percent" ? 100 : line.unitPrice}
                    step="0.01"
                    value={numberValue(line.discountValue)}
                    onChange={(e) => update(line.key, { discountValue: e.target.valueAsNumber })}
                    aria-label="Discount per unit"
                    aria-invalid={amounts.invalid || undefined}
                    readOnly={readOnly}
                  />
                </div>

                <input
                  className={`line-input number${amounts.invalid ? " invalid" : ""}`}
                  type="number"
                  inputMode="decimal"
                  min="0"
                  step="0.01"
                  value={Number.isFinite(sale) && Number.isFinite(line.discountValue) ? sale : ""}
                  onChange={(e) => {
                    const next = e.target.valueAsNumber;
                    // A typed sale price always becomes a flat discount.
                    update(line.key, {
                      discountType: "amount",
                      discountValue: Number.isFinite(next) ? round2((line.unitPrice || 0) - next) : Number.NaN,
                    });
                  }}
                  aria-label="Sale price"
                  aria-invalid={amounts.invalid || undefined}
                  readOnly={readOnly}
                />

                <strong className="amount line-total">{formatMoney(amounts.net, money)}</strong>

                {readOnly ? (
                  <span />
                ) : (
                  <button type="button" className="icon-button danger" aria-label={`Remove ${line.description || "line"}`} onClick={() => remove(line.key)}>
                    <Trash2 size={14} />
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
