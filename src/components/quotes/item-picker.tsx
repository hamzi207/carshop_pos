"use client";

import { useEffect, useState } from "react";
import { Box, Check, Loader2, Package, Plus, Search, X } from "lucide-react";
import { formatMoney, formatVehicle, type MoneyFormat } from "@/lib/format";
import type { FitmentVehicle } from "@/lib/types/inventory";
import type { PickerItem, PickerItemsResponse } from "@/lib/types/quote";

type Props = {
  vehicle: FitmentVehicle | null;
  money: MoneyFormat;
  /** Inventory ids already on the document (shown as "In quote"). */
  addedIds: ReadonlySet<string>;
  onAdd: (item: PickerItem) => void;
  /** Reports how many parts fit the chosen vehicle, for the fitment banner. */
  onFits: (fits: PickerItemsResponse["fits"]) => void;
};

function StockLabel({ item }: { item: PickerItem }) {
  if (item.quantity_on_hand <= 0) return <span className="stock-out">Out of stock</span>;
  if (item.quantity_on_hand <= item.low_stock_threshold) {
    return <span className="stock-low">Only {item.quantity_on_hand} left</span>;
  }
  return <span className="in-stock"><span className="status-dot" /> {item.quantity_on_hand} in stock</span>;
}

const FIT_BADGE = {
  universal: <span className="badge badge-green">Universal Fit</span>,
  vehicle: <span className="badge badge-blue">Fits this vehicle</span>,
  other: <span className="badge badge-amber">Not linked to this vehicle</span>,
} as const;

/**
 * Magic Fit accessory picker (spec §2.2 D, step 3). With a vehicle chosen and
 * "compatible only" on, it shows universal parts plus parts linked to that
 * vehicle; switch it off to see everything (each part says whether it fits).
 */
export function ItemPicker({ vehicle, money, addedIds, onAdd, onFits }: Props) {
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [compatibleOnly, setCompatibleOnly] = useState(true);
  // Results remember which request they answer; until the current one is
  // answered, the list shows the previous results with a spinner.
  const [result, setResult] = useState<{ request: string; items: PickerItem[]; error: string | null }>({
    request: "",
    items: [],
    error: null,
  });

  useEffect(() => {
    const timer = setTimeout(() => setQuery(search.trim()), 250);
    return () => clearTimeout(timer);
  }, [search]);

  const vehicleId = vehicle?.id ?? null;
  const params = new URLSearchParams();
  if (query) params.set("q", query);
  if (vehicleId) params.set("vehicle", String(vehicleId));
  if (vehicleId && !compatibleOnly) params.set("all", "1");
  const request = `/api/quote-items?${params}`;

  useEffect(() => {
    const ctrl = new AbortController();
    fetch(request, { signal: ctrl.signal })
      .then(async (res) => {
        if (!res.ok) throw new Error("Couldn't load parts.");
        const body = (await res.json()) as PickerItemsResponse;
        setResult({ request, items: body.items, error: null });
        onFits(body.fits);
      })
      .catch((err) => !ctrl.signal.aborted && setResult({ request, items: [], error: err.message }));
    return () => ctrl.abort();
    // onFits is a state setter from the parent; it never changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [request]);

  const { items, error } = result;
  const loading = result.request !== request;

  const filtering = Boolean(vehicle && compatibleOnly);

  return (
    <section className="card accessory-card">
      <div className="card-header">
        <div>
          <h2>{filtering ? "Compatible accessories" : "Parts catalog"}</h2>
          <p>
            {vehicle
              ? filtering
                ? `Universal parts and parts linked to the ${formatVehicle(vehicle)}.`
                : `Every part. Each one says whether it fits the ${formatVehicle(vehicle)}.`
              : "Pick a vehicle above to filter parts by fitment."}
          </p>
        </div>
        <label className={`toggle-label${vehicle ? "" : " disabled"}`} title={vehicle ? undefined : "Pick a vehicle first"}>
          <input
            type="checkbox"
            checked={filtering}
            disabled={!vehicle}
            onChange={(e) => setCompatibleOnly(e.target.checked)}
          />
          <span className="toggle" />
          <span>Compatible parts only</span>
        </label>
      </div>
      <div className="picker-search">
        {loading ? <Loader2 size={16} className="animate-spin" /> : <Search size={16} />}
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={filtering ? "Search compatible parts by name or SKU…" : "Search parts by name, SKU or vehicle…"}
          aria-label="Search parts"
          maxLength={100}
        />
        {search && (
          <button type="button" aria-label="Clear search" onClick={() => setSearch("")}>
            <X size={14} />
          </button>
        )}
      </div>
      <div className="catalog-list">
        {error && <div className="form-alert form-alert-error">{error}</div>}
        {!error && !loading && items.length === 0 && (
          <div className="empty-state compact">
            <span className="header-icon blue"><Package size={18} /></span>
            <strong>{query ? "No parts match this search" : filtering ? "No parts fit this vehicle yet" : "No parts in your inventory yet"}</strong>
            {filtering ? "Turn off “Compatible parts only” to see everything." : "Add parts on the Inventory page."}
          </div>
        )}
        {items.map((item) => {
          const inQuote = addedIds.has(item.id);
          return (
            <div className="catalog-row" key={item.id}>
              <div className="product-thumbnail"><Box size={17} /></div>
              <div className="catalog-info">
                <span className="mono">{item.sku}</span>
                <strong title={item.name}>{item.name}</strong>
                <div>
                  <span className="badge badge-purple">{item.category}</span>
                  {vehicle ? FIT_BADGE[item.fit] : item.is_universal && FIT_BADGE.universal}
                </div>
              </div>
              <div className="catalog-meta">
                <strong>{formatMoney(item.selling_price, money)}</strong>
                <StockLabel item={item} />
              </div>
              <button
                type="button"
                className="button"
                onClick={() => onAdd(item)}
                aria-label={inQuote ? `Add another ${item.name}` : `Add ${item.name}`}
              >
                {inQuote ? <Check size={14} /> : <Plus size={14} />} {inQuote ? "Add 1 more" : "Add"}
              </button>
            </div>
          );
        })}
        {items.length === 50 && <p className="catalog-more">Showing the first 50 parts. Search to narrow it down.</p>}
      </div>
    </section>
  );
}
