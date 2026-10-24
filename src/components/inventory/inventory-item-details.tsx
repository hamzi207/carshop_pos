"use client";

import { Dialog } from "radix-ui";
import { Package, Pencil, X } from "lucide-react";
import { asValues, attributeText, type Attribute } from "@/lib/attributes";
import { formatMoney, formatVehicleGroups, marginPercent, type MoneyFormat } from "@/lib/format";
import type { InventoryListItem } from "@/lib/types/inventory";

type Props = {
  item: InventoryListItem | null;
  money: MoneyFormat;
  /** Attribute definitions; the item's stored values show by label (archived ones too, so nothing is hidden). */
  attributes: Attribute[];
  fitment: boolean;
  /** Full category path, e.g. "Exterior › Wrapping › Tinting Film". */
  categoryLabel: string;
  onOpenChange: (open: boolean) => void;
  onEdit: (item: InventoryListItem) => void;
};

function Row({ label, value, mono }: { label: string; value: React.ReactNode; mono?: boolean }) {
  return (
    <div>
      <span>{label}</span>
      <strong className={mono ? "mono" : undefined}>{value}</strong>
    </div>
  );
}

/**
 * Read-only product details, opened from the product name. The vendor shows
 * here only, not in the inventory table (docs/changes.md §6).
 */
export function InventoryItemDetails({ item, money, attributes, fitment, categoryLabel, onOpenChange, onEdit }: Props) {
  const cost = Number(item?.cost_price ?? 0);
  const selling = Number(item?.selling_price ?? 0);
  const margin = marginPercent(cost, selling);
  const available = item ? item.quantity_on_hand - item.reserved_quantity : 0;
  const values = asValues(item?.attributes);
  const shownAttributes = attributes.filter((a) => values[a.key] !== undefined);

  return (
    <Dialog.Root open={item !== null} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="modal-backdrop">
          <Dialog.Content className="modal">
            <div className="modal-header">
              <div>
                <span className="header-icon blue"><Package size={18} /></span>
                <div>
                  <Dialog.Title asChild><h2 className="product-details-title">{item?.name}</h2></Dialog.Title>
                  <Dialog.Description asChild>
                    <p><span className="mono">{item?.sku}</span> · {categoryLabel}</p>
                  </Dialog.Description>
                </div>
              </div>
              <Dialog.Close asChild>
                <button type="button" className="icon-button" aria-label="Close"><X size={16} /></button>
              </Dialog.Close>
            </div>
            {item && (
              <div className="modal-body">
                <div className="product-details">
                  <Row label="Vendor / supplier" value={item.vendor_name || "—"} />
                  {fitment && (
                    <Row label="Fitment" value={item.is_universal ? "Universal Fit (all vehicles)" : formatVehicleGroups(item.vehicles).join(", ")} />
                  )}
                  {shownAttributes.map((a) => (
                    <Row key={a.id} label={a.label} value={attributeText(a, values[a.key])} />
                  ))}
                  <Row label="Cost price" value={formatMoney(cost, money)} />
                  <Row
                    label="Selling price"
                    value={`${formatMoney(selling, money)} ${item.price_includes_tax ? "(incl. tax)" : "(+ tax)"}`}
                  />
                  <Row label="Margin" value={margin === null ? "—" : `${margin.toFixed(1)}%`} />
                  <Row label="On hand" value={item.quantity_on_hand} />
                  <Row label="Reserved on quotations" value={item.reserved_quantity} />
                  <Row label="Available to sell" value={available} />
                  <Row label="Low-stock alert at" value={item.low_stock_threshold} />
                </div>
                {item.description && <p className="product-details-note">{item.description}</p>}
              </div>
            )}
            <div className="modal-footer">
              <Dialog.Close asChild>
                <button type="button" className="button">Close</button>
              </Dialog.Close>
              {item && (
                <button type="button" className="button button-primary" onClick={() => onEdit(item)}>
                  <Pencil size={14} /> Edit Product
                </button>
              )}
            </div>
          </Dialog.Content>
        </Dialog.Overlay>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
