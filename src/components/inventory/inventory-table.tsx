"use client";

import { useMemo, useState } from "react";
import { AlertTriangle, Car, CheckCircle2, Package, Pencil, Plus, Trash2 } from "lucide-react";
import { buildCategoryIndex, categoryIcon, fullPath, shortPath, type Category } from "@/lib/categories";
import { formatMoney, formatVehicleGroups, marginPercent, type MoneyFormat } from "@/lib/format";
import type { InventoryListItem } from "@/lib/types/inventory";
import { DeleteItemDialog } from "./delete-item-dialog";
import { InventoryItemDetails } from "./inventory-item-details";
import { InventoryItemDialog } from "./inventory-item-dialog";

type Props = {
  items: InventoryListItem[];
  money: MoneyFormat;
  /** Shop default for new items (tenants.prices_include_tax). */
  pricesIncludeTax: boolean;
  categories: Category[];
  /** True when a search/category/stock/fitment filter is active (changes the empty state). */
  filtered: boolean;
};

function FitmentBadge({ item }: { item: InventoryListItem }) {
  if (item.is_universal) {
    return (
      <span className="badge badge-green">
        <CheckCircle2 size={12} /> Universal Fit
      </span>
    );
  }
  return (
    <span className="badge badge-blue">
      <Car size={12} /> Vehicle Specific
    </span>
  );
}

const VEHICLE_LINES = 2;

/** Make Model Year(s), one line per model; long lists collapse to "+N more". */
function VehicleCell({ item }: { item: InventoryListItem }) {
  if (item.is_universal) return <span className="vehicle-cell-all">All vehicles</span>;
  const groups = formatVehicleGroups(item.vehicles);
  const shown = groups.slice(0, VEHICLE_LINES);
  const hidden = groups.length - shown.length;
  return (
    <div className="vehicle-cell" title={hidden > 0 ? groups.join("\n") : undefined}>
      {shown.map((label) => (
        <span key={label}>{label}</span>
      ))}
      {hidden > 0 && <span className="vehicle-cell-more">+{hidden} more</span>}
    </div>
  );
}

function MarginBadge({ cost, selling }: { cost: number; selling: number }) {
  const margin = marginPercent(cost, selling);
  if (margin === null) return <span className="badge">—</span>;
  const tone = margin < 0 ? "badge-red" : margin >= 50 ? "badge-green" : "badge-amber";
  return <span className={`badge ${tone}`}>{margin.toFixed(1)}% Margin</span>;
}

/** Available = on hand − reserved on open quotations; the low-stock alert uses available. */
export const availableOf = (item: Pick<InventoryListItem, "quantity_on_hand" | "reserved_quantity">) =>
  item.quantity_on_hand - item.reserved_quantity;

function StockCell({ item }: { item: InventoryListItem }) {
  const available = availableOf(item);
  const low = available <= item.low_stock_threshold;
  return (
    <div className="stock-cell">
      {low ? (
        <span className="badge badge-red" title={`Alert level: ${item.low_stock_threshold}`}>
          <AlertTriangle size={12} />
          {available <= 0 ? "None available" : `${available} available`} · Min {item.low_stock_threshold}
        </span>
      ) : (
        <span className="badge badge-green">{available} available</span>
      )}
      <span className="stock-split">
        {item.quantity_on_hand} on hand{item.reserved_quantity > 0 ? ` · ${item.reserved_quantity} reserved` : ""}
      </span>
    </div>
  );
}

export function InventoryTable({ items, money, pricesIncludeTax, categories, filtered }: Props) {
  const index = useMemo(() => buildCategoryIndex(categories), [categories]);
  const [editing, setEditing] = useState<InventoryListItem | null>(null);
  const [viewing, setViewing] = useState<InventoryListItem | null>(null);
  const [deleting, setDeleting] = useState<InventoryListItem | null>(null);
  const [adding, setAdding] = useState(false);

  const lowStock = items.filter((i) => availableOf(i) <= i.low_stock_threshold).length;

  return (
    <section className="card inventory-table-card">
      <div className="inventory-summary">
        <div>
          <h2>{filtered ? "Matching inventory" : "All inventory"}</h2>
          <span className="badge">{items.length} {items.length === 1 ? "product" : "products"}</span>
          {lowStock > 0 && (
            <span className="badge badge-red">
              <AlertTriangle size={12} /> {lowStock} low stock
            </span>
          )}
        </div>
      </div>

      {items.length === 0 ? (
        <div className="empty-state">
          <span className="header-icon blue"><Package size={18} /></span>
          {filtered ? (
            <>
              <strong>No parts match these filters</strong>
              Try a different search, category, stock level or fitment type.
            </>
          ) : (
            <>
              <strong>No inventory yet</strong>
              Add your first part: a film roll, a speaker kit, or a vehicle-specific pre-cut.
              <div className="empty-state-action">
                <button type="button" className="button button-primary" onClick={() => setAdding(true)}>
                  <Plus size={14} /> Add New Part
                </button>
              </div>
            </>
          )}
        </div>
      ) : (
        <div className="table-wrap">
          <table className="inventory-table">
            <thead>
              <tr>
                <th>PRODUCT</th>
                <th>FITMENT TYPE</th>
                <th>VEHICLE</th>
                <th>COST</th>
                <th>SELLING PRICE</th>
                <th>MARGIN</th>
                <th>STOCK</th>
                <th><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => {
                const category = index.byId.get(item.category_id);
                const Icon = categoryIcon(category);
                const cost = Number(item.cost_price);
                const selling = Number(item.selling_price);
                const low = availableOf(item) <= item.low_stock_threshold;
                return (
                  <tr key={item.id} className={low ? "low-stock-row" : undefined}>
                    <td>
                      <div className="inventory-product">
                        <div className="mini-product"><Icon size={16} /></div>
                        <div>
                          <button type="button" className="product-link" onClick={() => setViewing(item)}>
                            {item.name}
                          </button>
                          <span>
                            <span className="mono">{item.sku}</span>
                            {category && <span className="badge" title={fullPath(category)}>{shortPath(category)}</span>}
                          </span>
                        </div>
                      </div>
                    </td>
                    <td><FitmentBadge item={item} /></td>
                    <td><VehicleCell item={item} /></td>
                    <td>{formatMoney(cost, money)}</td>
                    <td className="amount">
                      {formatMoney(selling, money)}
                      <span className="price-tax-note">{item.price_includes_tax ? "incl. tax" : "+ tax"}</span>
                    </td>
                    <td><MarginBadge cost={cost} selling={selling} /></td>
                    <td><StockCell item={item} /></td>
                    <td>
                      <div className="row-actions">
                        <button type="button" className="icon-button" aria-label={`Edit ${item.name}`} onClick={() => setEditing(item)}>
                          <Pencil size={15} />
                        </button>
                        <button type="button" className="icon-button danger" aria-label={`Delete ${item.name}`} onClick={() => setDeleting(item)}>
                          <Trash2 size={15} />
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

      <InventoryItemDialog
        open={adding || editing !== null}
        onOpenChange={(open) => {
          if (!open) {
            setAdding(false);
            setEditing(null);
          }
        }}
        currency={money.currency}
        pricesIncludeTax={pricesIncludeTax}
        categories={categories}
        item={editing ?? undefined}
      />
      <DeleteItemDialog item={deleting} onOpenChange={(open) => !open && setDeleting(null)} />
      <InventoryItemDetails
        item={viewing}
        money={money}
        categoryLabel={viewing ? (() => { const c = index.byId.get(viewing.category_id); return c ? fullPath(c) : "—"; })() : ""}
        onOpenChange={(open) => !open && setViewing(null)}
        onEdit={(item) => {
          setViewing(null);
          setEditing(item);
        }}
      />
    </section>
  );
}
