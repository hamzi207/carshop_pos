"use client";

import { ArrowDown, ArrowUp, Minus, Plus, Trash2, Wrench } from "lucide-react";
import { formatMoney, type MoneyFormat } from "@/lib/format";
import { lineTotal } from "@/lib/quote-math";

/** One line in the builder. `key` is local only (React list key). */
export type BuilderLine = {
  key: string;
  itemId: string | null;
  sku: string | null;
  description: string;
  isLabor: boolean;
  quantity: number;
  unitPrice: number;
  priceIncludesTax: boolean;
  /** Stock on hand for parts (null for labour / unknown). */
  stock: number | null;
};

type Props = {
  lines: BuilderLine[];
  onChange: (lines: BuilderLine[]) => void;
  onAddLabor: () => void;
  money: MoneyFormat;
  readOnly: boolean;
};

const numberValue = (n: number) => (Number.isFinite(n) ? n : "");

export function LineItems({ lines, onChange, onAddLabor, money, readOnly }: Props) {
  const update = (key: string, patch: Partial<BuilderLine>) =>
    onChange(lines.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  const remove = (key: string) => onChange(lines.filter((l) => l.key !== key));
  const move = (index: number, by: -1 | 1) => {
    const next = [...lines];
    [next[index], next[index + by]] = [next[index + by], next[index]];
    onChange(next);
  };

  const parts = lines.filter((l) => !l.isLabor).length;
  const labor = lines.length - parts;

  return (
    <section className="card line-items-card">
      <div className="card-header">
        <div>
          <h2>Line items</h2>
          <p>
            {lines.length === 0
              ? "Add parts from the catalog, or a fitting / labour charge."
              : `${parts} ${parts === 1 ? "part" : "parts"}${labor ? `, ${labor} labour / service ${labor === 1 ? "line" : "lines"}` : ""}`}
          </p>
        </div>
        <span className="badge badge-blue">{lines.length} {lines.length === 1 ? "line" : "lines"}</span>
      </div>

      {lines.length > 0 && (
        <div className="line-items">
          <div className="line-head">
            <span>ITEM</span>
            <span>QTY</span>
            <span>UNIT PRICE</span>
            <span>TOTAL</span>
            <span />
          </div>
          {lines.map((line, i) => {
            const short = !line.isLabor && line.stock !== null && line.quantity > line.stock;
            return (
              <div className="line-row" key={line.key}>
                <div>
                  {!readOnly && (
                    <span className="line-move">
                      <button type="button" aria-label="Move up" disabled={i === 0} onClick={() => move(i, -1)}>
                        <ArrowUp size={11} />
                      </button>
                      <button type="button" aria-label="Move down" disabled={i === lines.length - 1} onClick={() => move(i, 1)}>
                        <ArrowDown size={11} />
                      </button>
                    </span>
                  )}
                  <div className="line-desc">
                    {line.isLabor ? (
                      <>
                        <input
                          className="line-input"
                          value={line.description}
                          onChange={(e) => update(line.key, { description: e.target.value })}
                          placeholder="e.g. Front window tint installation – 1.5 hours"
                          aria-label="Labour / service description"
                          maxLength={300}
                          readOnly={readOnly}
                        />
                        <span className="line-tag"><Wrench size={10} /> Labour / service</span>
                      </>
                    ) : (
                      <>
                        <strong title={line.description}>{line.description}</strong>
                        <span className="mono">{line.sku ?? "Removed from inventory"}</span>
                        {short && (
                          <span className="stock-low">
                            {line.stock! <= 0 ? "Out of stock" : `Only ${line.stock} in stock`}
                          </span>
                        )}
                      </>
                    )}
                  </div>
                </div>

                {line.isLabor ? (
                  <input
                    className="line-input number"
                    type="number"
                    inputMode="decimal"
                    min="0.01"
                    step="0.25"
                    value={numberValue(line.quantity)}
                    onChange={(e) => update(line.key, { quantity: e.target.valueAsNumber })}
                    aria-label="Hours / quantity"
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

                <input
                  className="line-input number"
                  type="number"
                  inputMode="decimal"
                  min="0"
                  step="0.01"
                  value={numberValue(line.unitPrice)}
                  onChange={(e) => update(line.key, { unitPrice: e.target.valueAsNumber })}
                  aria-label="Unit price"
                  title={line.priceIncludesTax ? "Price includes tax" : "Tax is added on top"}
                  readOnly={readOnly}
                />
                <strong className="amount">
                  {formatMoney(lineTotal({ quantity: line.quantity || 0, unitPrice: line.unitPrice || 0 }), money)}
                </strong>
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

      {!readOnly && (
        <button type="button" className="labor-button" onClick={onAddLabor}>
          <span><Wrench size={16} /></span>
          <div>
            <strong>Add optional fitting / labour service</strong>
            <small>Installation, fitting fees or custom shop labour. Parts-only sellers can skip this.</small>
          </div>
          <Plus size={16} />
        </button>
      )}
    </section>
  );
}
