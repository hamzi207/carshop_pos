"use client";

import { useState } from "react";
import { Dialog } from "radix-ui";
import { Controller, useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { Car, CheckCircle2, Loader2, Package, Plus, Save, Wand2, X } from "lucide-react";
import { createInventoryItem, updateInventoryItem } from "@/lib/actions/inventory";
import { marginPercent } from "@/lib/format";
import type { FitmentVehicle, InventoryListItem } from "@/lib/types/inventory";
import {
  INVENTORY_CATEGORIES,
  inventoryItemSchema,
  type InventoryCategory,
  type InventoryItemInput,
} from "@/lib/validations/inventory.schema";
import { YmmCompatibilitySelector } from "./ymm-compatibility-selector";

const SKU_PREFIX: Record<InventoryCategory, string> = {
  "Window Film": "WF",
  "Vinyl Wrap": "VW",
  PPF: "PPF",
  "Car Audio": "AUD",
  Accessories: "ACC",
  "Hardware / Chemicals": "CHM",
};

function generateSku(category: InventoryCategory) {
  const suffix = Math.random().toString(36).slice(2, 7).toUpperCase();
  return `${SKU_PREFIX[category]}-${suffix}`;
}

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currency: string;
  /** Shop default for "price includes tax" on new items. */
  pricesIncludeTax: boolean;
  /** Edit this item; omit to create a new one. */
  item?: InventoryListItem;
};

/** Add / edit inventory part modal (Figma "Add inventory part"). */
export function InventoryItemDialog({ open, onOpenChange, currency, pricesIncludeTax, item }: Props) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="modal-backdrop">
          <Dialog.Content className="modal">
            {/* Remount per open so the form always starts from the item's current values. */}
            {open && (
              <ItemForm
                key={item?.id ?? "new"}
                item={item}
                currency={currency}
                pricesIncludeTax={pricesIncludeTax}
                onDone={() => onOpenChange(false)}
              />
            )}
          </Dialog.Content>
        </Dialog.Overlay>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function ItemForm({
  item,
  currency,
  pricesIncludeTax,
  onDone,
}: {
  item?: InventoryListItem;
  currency: string;
  pricesIncludeTax: boolean;
  onDone: () => void;
}) {
  const isEdit = Boolean(item);
  const [serverError, setServerError] = useState<string | null>(null);
  const [vehicles, setVehicles] = useState<FitmentVehicle[]>(item?.vehicles ?? []);

  const {
    register,
    control,
    handleSubmit,
    setValue,
    setError,
    getValues,
    formState: { errors, isSubmitting },
  } = useForm<InventoryItemInput>({
    resolver: zodResolver(inventoryItemSchema),
    defaultValues: item
      ? {
          sku: item.sku,
          name: item.name,
          description: item.description ?? "",
          category: item.category as InventoryCategory,
          costPrice: Number(item.cost_price),
          sellingPrice: Number(item.selling_price),
          quantityOnHand: item.quantity_on_hand,
          lowStockThreshold: item.low_stock_threshold,
          priceIncludesTax: item.price_includes_tax,
          isUniversal: item.is_universal,
          vehicleIds: item.vehicles.map((v) => v.id),
        }
      : {
          sku: "",
          name: "",
          description: "",
          category: "Window Film",
          quantityOnHand: 0,
          lowStockThreshold: 5,
          priceIncludesTax: pricesIncludeTax,
          isUniversal: true,
          vehicleIds: [],
        },
  });

  const [cost, selling, isUniversal] = useWatch({
    control,
    name: ["costPrice", "sellingPrice", "isUniversal"],
  });
  const margin =
    Number.isFinite(cost) && Number.isFinite(selling) ? marginPercent(cost, selling) : null;

  const setVehicleList = (next: FitmentVehicle[]) => {
    setVehicles(next);
    setValue("vehicleIds", next.map((v) => v.id), { shouldValidate: next.length > 0 });
  };

  const onSubmit = handleSubmit(async (values) => {
    setServerError(null);
    const result = item
      ? await updateInventoryItem(item.id, values)
      : await createInventoryItem(values);

    if (result.status === "error") {
      if (result.field) setError(result.field, { message: result.message });
      else setServerError(result.message);
      return;
    }
    toast.success(isEdit ? `${values.name} updated` : `${values.name} added to inventory`);
    onDone();
  });

  const fieldError = (name: keyof InventoryItemInput) =>
    errors[name]?.message ? (
      <span className="field-error" id={`${name}-error`}>{errors[name]?.message}</span>
    ) : null;

  const invalid = (name: keyof InventoryItemInput) => ({
    "aria-invalid": errors[name] ? true : undefined,
    "aria-describedby": errors[name] ? `${name}-error` : undefined,
  });

  return (
    <form onSubmit={onSubmit} noValidate>
      <div className="modal-header">
        <div>
          <span className="header-icon blue"><Package size={18} /></span>
          <div>
            <Dialog.Title asChild>
              <h2>{isEdit ? "Edit inventory part" : "Add inventory part"}</h2>
            </Dialog.Title>
            <Dialog.Description asChild>
              <p>
                {isEdit
                  ? "Update pricing, stock and vehicle fitment."
                  : "Create a product and configure vehicle fitment."}
              </p>
            </Dialog.Description>
          </div>
        </div>
        <Dialog.Close asChild>
          <button type="button" className="icon-button" aria-label="Close">
            <X size={16} />
          </button>
        </Dialog.Close>
      </div>

      <div className="modal-body">
        {serverError && (
          <div className="form-alert form-alert-error modal-alert" role="alert">{serverError}</div>
        )}
        <div className="form-grid">
          <label>
            <span>SKU / PART CODE</span>
            <div className="input-with-action">
              <input placeholder="e.g. WF-CER20-40" autoComplete="off" {...invalid("sku")} {...register("sku")} />
              <button
                type="button"
                className="button button-ghost"
                title="Generate a SKU from the category"
                onClick={() =>
                  setValue("sku", generateSku(getValues("category")), { shouldValidate: true })
                }
              >
                <Wand2 size={13} /> Generate
              </button>
            </div>
            {fieldError("sku")}
          </label>
          <label>
            <span>CATEGORY</span>
            <select {...invalid("category")} {...register("category")}>
              {INVENTORY_CATEGORIES.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
            {fieldError("category")}
          </label>
          <label className="span-two">
            <span>PRODUCT NAME</span>
            <input placeholder="e.g. Suntek Carbon 20% · 40in Roll" {...invalid("name")} {...register("name")} />
            {fieldError("name")}
          </label>
          <label className="span-two">
            <span>DESCRIPTION (OPTIONAL)</span>
            <textarea rows={2} placeholder="Notes for your team: brand, spec, roll size…" {...invalid("description")} {...register("description")} />
            {fieldError("description")}
          </label>
          <label>
            <span>COST PRICE</span>
            <div className="money-input">
              <span>{currency}</span>
              <input type="number" inputMode="decimal" step="0.01" min="0" placeholder="0.00" {...invalid("costPrice")} {...register("costPrice", { valueAsNumber: true })} />
            </div>
            {fieldError("costPrice")}
          </label>
          <label>
            <span>SELLING PRICE</span>
            <div className="money-input">
              <span>{currency}</span>
              <input type="number" inputMode="decimal" step="0.01" min="0" placeholder="0.00" {...invalid("sellingPrice")} {...register("sellingPrice", { valueAsNumber: true })} />
            </div>
            {fieldError("sellingPrice") ??
              (margin !== null && (
                <span className={`field-hint ${margin < 0 ? "negative" : ""}`}>
                  {margin.toFixed(1)}% margin
                </span>
              ))}
          </label>
          <label>
            <span>{isEdit ? "STOCK ON HAND" : "STARTING STOCK"}</span>
            <input type="number" inputMode="numeric" step="1" min="0" {...invalid("quantityOnHand")} {...register("quantityOnHand", { valueAsNumber: true })} />
            {fieldError("quantityOnHand")}
          </label>
          <label>
            <span>LOW STOCK ALERT AT</span>
            <input type="number" inputMode="numeric" step="1" min="0" {...invalid("lowStockThreshold")} {...register("lowStockThreshold", { valueAsNumber: true })} />
            {fieldError("lowStockThreshold")}
          </label>
          <label className="span-two check-field">
            <input type="checkbox" {...register("priceIncludesTax")} />
            <div>
              <strong>Selling price includes tax</strong>
              <p>On quotes, tax is worked out of this price instead of added on top. The default comes from Settings.</p>
            </div>
          </label>
        </div>

        <div className="compatibility">
          <div>
            <h3>Compatibility mode</h3>
            <p>Choose how this product should match to vehicles.</p>
          </div>
          <Controller
            control={control}
            name="isUniversal"
            render={({ field }) => (
              <div className="radio-cards" role="radiogroup" aria-label="Compatibility mode">
                <button
                  type="button"
                  role="radio"
                  aria-checked={field.value}
                  className={field.value ? "selected" : ""}
                  onClick={() => field.onChange(true)}
                >
                  <span className="radio-dot" />
                  <div className="choice-icon universal"><CheckCircle2 size={16} /></div>
                  <strong>Universal Fit</strong>
                  <p>Applies to all vehicles. Ideal for film rolls and generic accessories.</p>
                </button>
                <button
                  type="button"
                  role="radio"
                  aria-checked={!field.value}
                  className={!field.value ? "selected" : ""}
                  onClick={() => field.onChange(false)}
                >
                  <span className="radio-dot" />
                  <div className="choice-icon vehicle"><Car size={16} /></div>
                  <strong>Vehicle Specific</strong>
                  <p>Link this product to specific Year, Make, and Model records.</p>
                </button>
              </div>
            )}
          />
          {!isUniversal && (
            <YmmCompatibilitySelector
              value={vehicles}
              onChange={setVehicleList}
              error={errors.vehicleIds?.message}
            />
          )}
        </div>
      </div>

      <div className="modal-footer">
        <Dialog.Close asChild>
          <button type="button" className="button">Cancel</button>
        </Dialog.Close>
        <button type="submit" className="button button-primary" disabled={isSubmitting}>
          {isSubmitting ? (
            <Loader2 size={14} className="animate-spin" />
          ) : isEdit ? (
            <Save size={14} />
          ) : (
            <Plus size={14} />
          )}
          {isSubmitting ? "Saving…" : isEdit ? "Save Changes" : "Add Inventory Part"}
        </button>
      </div>
    </form>
  );
}
