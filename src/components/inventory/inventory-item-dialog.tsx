"use client";

import { useEffect, useMemo, useState } from "react";
import { Dialog } from "radix-ui";
import { Controller, useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Car, CheckCircle2, Loader2, Package, Plus, Save, Wand2, X } from "lucide-react";
import { createInventoryItem, updateInventoryItem } from "@/lib/actions/inventory";
import { formatMoney, marginPercent } from "@/lib/format";
import { notify } from "@/lib/notify";
import { buildCategoryIndex, skuPrefix, type Category, type CategoryIndex } from "@/lib/categories";
import { useDiscardGuard } from "@/components/shared/discard-changes";
import { ModalSheet } from "@/components/shared/modal-sheet";
import type { FitmentVehicle, InventoryListItem } from "@/lib/types/inventory";
import { inventoryItemSchema, type InventoryItemInput } from "@/lib/validations/inventory.schema";
import { CategoryPicker } from "./category-picker";
import { YmmCompatibilitySelector } from "./ymm-compatibility-selector";

/** Prefix from the main category (e.g. EXT-4K9QZ). */
function generateSku(index: CategoryIndex, categoryId: string | undefined) {
  const suffix = Math.random().toString(36).slice(2, 7).toUpperCase();
  return `${skuPrefix(categoryId ? index.byId.get(categoryId) : undefined)}-${suffix}`;
}

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currency: string;
  /** Shop default for "price includes tax" on new items. */
  pricesIncludeTax: boolean;
  categories: Category[];
  /** Edit this item; omit to create a new one. */
  item?: InventoryListItem;
};

/** Add / edit inventory product modal (Figma "Add inventory product"). */
export function InventoryItemDialog({ open, onOpenChange, currency, pricesIncludeTax, categories, item }: Props) {
  // Closing with unsaved edits asks first (Cancel, X, Escape, clicking outside).
  const guard = useDiscardGuard({
    onOpenChange,
    discardedNote: item ? `${item.name} was left as it was saved.` : "The new product was not added to inventory.",
  });
  return (
    <>
      <Dialog.Root open={open} onOpenChange={guard.requestOpenChange}>
        <ModalSheet>
          {/* Remount per open so the form always starts from the item's current values. */}
          {open && (
            <ItemForm
              key={item?.id ?? "new"}
              item={item}
              currency={currency}
              pricesIncludeTax={pricesIncludeTax}
              categories={categories}
              onDirtyChange={guard.setDirty}
              onDone={guard.close}
            />
          )}
        </ModalSheet>
      </Dialog.Root>
      {guard.prompt}
    </>
  );
}

function ItemForm({
  item,
  currency,
  pricesIncludeTax,
  categories,
  onDirtyChange,
  onDone,
}: {
  item?: InventoryListItem;
  currency: string;
  pricesIncludeTax: boolean;
  categories: Category[];
  onDirtyChange: (dirty: boolean) => void;
  onDone: () => void;
}) {
  const isEdit = Boolean(item);
  const [serverError, setServerError] = useState<string | null>(null);
  const [vehicles, setVehicles] = useState<FitmentVehicle[]>(item?.vehicles ?? []);
  const index = useMemo(() => buildCategoryIndex(categories), [categories]);

  const {
    register,
    control,
    handleSubmit,
    setValue,
    setError,
    getValues,
    formState: { errors, isSubmitting, isDirty },
  } = useForm<InventoryItemInput>({
    resolver: zodResolver(inventoryItemSchema),
    defaultValues: item
      ? {
          sku: item.sku,
          name: item.name,
          description: item.description ?? "",
          vendorName: item.vendor_name ?? "",
          categoryId: item.category_id,
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
          vendorName: "",
          quantityOnHand: 0,
          lowStockThreshold: 5,
          priceIncludesTax: pricesIncludeTax,
          isUniversal: true,
          vehicleIds: [],
        },
  });

  useEffect(() => onDirtyChange(isDirty), [isDirty, onDirtyChange]);

  const [cost, selling, isUniversal] = useWatch({
    control,
    name: ["costPrice", "sellingPrice", "isUniversal"],
  });
  const margin =
    Number.isFinite(cost) && Number.isFinite(selling) ? marginPercent(cost, selling) : null;

  const setVehicleList = (next: FitmentVehicle[]) => {
    setVehicles(next);
    setValue("vehicleIds", next.map((v) => v.id), { shouldValidate: next.length > 0, shouldDirty: true });
  };

  const onSubmit = handleSubmit(async (values) => {
    setServerError(null);
    const result = item
      ? await updateInventoryItem(item.id, values)
      : await createInventoryItem(values);

    if (result.status === "error") {
      if (result.field) setError(result.field, { message: result.message });
      else setServerError(result.message);
      notify.error(isEdit ? "Product not saved" : "Product not added", result.message);
      return;
    }
    notify.success(
      isEdit ? `${values.name} updated` : `${values.name} added to inventory`,
      `${values.sku} · ${values.quantityOnHand} on hand · ${formatMoney(values.sellingPrice, { currency, showPaisa: true })}${values.isUniversal ? " · Universal Fit" : ` · fits ${values.vehicleIds.length} vehicle${values.vehicleIds.length === 1 ? "" : "s"}`}`,
    );
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
              <h2>{isEdit ? "Edit inventory product" : "Add inventory product"}</h2>
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
            <span>SKU / PRODUCT CODE</span>
            <div className="input-with-action">
              <input placeholder="e.g. WF-CER20-40" autoComplete="off" {...invalid("sku")} {...register("sku")} />
              <button
                type="button"
                className="button button-ghost"
                title="Generate a SKU from the main category"
                onClick={() =>
                  setValue("sku", generateSku(index, getValues("categoryId")), { shouldValidate: true, shouldDirty: true })
                }
              >
                <Wand2 size={13} /> Generate
              </button>
            </div>
            {fieldError("sku")}
          </label>
          <div className="form-field">
            <label htmlFor="item-category"><span>CATEGORY</span></label>
            <Controller
              control={control}
              name="categoryId"
              render={({ field }) => (
                <CategoryPicker
                  id="item-category"
                  index={index}
                  value={field.value ?? null}
                  onChange={(id) => {
                    field.onChange(id ?? undefined);
                    field.onBlur();
                  }}
                  invalid={Boolean(errors.categoryId)}
                  describedBy={errors.categoryId ? "categoryId-error" : undefined}
                />
              )}
            />
            {fieldError("categoryId")}
          </div>
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
          <label className="span-two">
            <span>VENDOR / SUPPLIER (OPTIONAL)</span>
            <input placeholder="e.g. Lahore Auto Traders" {...invalid("vendorName")} {...register("vendorName")} />
            {fieldError("vendorName")}
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
            {fieldError("quantityOnHand") ??
              (item && item.reserved_quantity > 0 && (
                <span className="field-note">{item.reserved_quantity} reserved on open quotations.</span>
              ))}
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
          {isSubmitting ? "Saving…" : isEdit ? "Save Changes" : "Add Inventory Product"}
        </button>
      </div>
    </form>
  );
}
