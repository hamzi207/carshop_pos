"use client";

import { useState } from "react";
import { Controller, useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { Clock, Coins, Loader2, Phone, Receipt, Save } from "lucide-react";
import { updateShopSettings } from "@/lib/actions/settings";
import { formatMoney } from "@/lib/format";
import { CURRENCIES, shopSettingsSchema, type ShopSettingsInput } from "@/lib/validations/settings.schema";

type Props = {
  initial: ShopSettingsInput;
  timezone: string;
  /** Staff can see the settings but not change them. */
  canEdit: boolean;
};

export function ShopSettingsForm({ initial, timezone, canEdit }: Props) {
  const [serverError, setServerError] = useState<string | null>(null);
  const {
    register,
    control,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting, isDirty },
  } = useForm<ShopSettingsInput>({
    resolver: zodResolver(shopSettingsSchema),
    defaultValues: initial,
  });

  const [currency, showPaisa] = useWatch({ control, name: ["currency", "showPaisa"] });
  const preview = formatMoney(12500, { currency, showPaisa });

  const onSubmit = handleSubmit(async (values) => {
    setServerError(null);
    const result = await updateShopSettings(values);
    if (result.status === "error") {
      setServerError(result.message);
      return;
    }
    reset(values);
    toast.success("Settings saved");
  });

  return (
    <form className="settings-form" onSubmit={onSubmit} noValidate>
      {!canEdit && (
        <div className="form-alert form-alert-info" role="status">
          Only shop admins can change these settings.
        </div>
      )}
      {serverError && <div className="form-alert form-alert-error" role="alert">{serverError}</div>}

      <fieldset disabled={!canEdit || isSubmitting}>
        <section className="card settings-card">
          <div className="settings-card-head">
            <span className="header-icon blue"><Coins size={18} /></span>
            <div>
              <h2>Currency</h2>
              <p>How prices appear on inventory, quotes and invoices.</p>
            </div>
          </div>
          <div className="settings-row">
            <span className="settings-label">Currency symbol</span>
            <Controller
              control={control}
              name="currency"
              render={({ field }) => (
                <div className="segmented" role="radiogroup" aria-label="Currency symbol">
                  {CURRENCIES.map((c) => (
                    <button
                      key={c}
                      type="button"
                      role="radio"
                      aria-checked={field.value === c}
                      className={field.value === c ? "active" : ""}
                      onClick={() => field.onChange(c)}
                    >
                      {c}
                    </button>
                  ))}
                </div>
              )}
            />
          </div>
          <label className="settings-row">
            <span className="settings-label">
              Show paisa
              <small>Off shows whole rupees only.</small>
            </span>
            <input type="checkbox" className="switch" {...register("showPaisa")} />
          </label>
          <div className="settings-preview">Preview: <strong>{preview}</strong></div>
        </section>

        <section className="card settings-card">
          <div className="settings-card-head">
            <span className="header-icon blue"><Receipt size={18} /></span>
            <div>
              <h2>Tax</h2>
              <p>Applied to quotes and invoices. Use 0 if you don&apos;t charge tax.</p>
            </div>
          </div>
          <label className="settings-row">
            <span className="settings-label">Tax rate (GST / sales tax)</span>
            <span className="percent-input">
              <input
                type="number"
                inputMode="decimal"
                step="0.01"
                min="0"
                max="100"
                aria-invalid={errors.taxRate ? true : undefined}
                {...register("taxRate", { valueAsNumber: true })}
              />
              <span>%</span>
            </span>
          </label>
          {errors.taxRate && <span className="field-error settings-error">{errors.taxRate.message}</span>}
          <label className="settings-row">
            <span className="settings-label">
              Selling prices include tax
              <small>Default for new products; each product can override it.</small>
            </span>
            <input type="checkbox" className="switch" {...register("pricesIncludeTax")} />
          </label>
        </section>

        <section className="card settings-card">
          <div className="settings-card-head">
            <span className="header-icon blue"><Phone size={18} /></span>
            <div>
              <h2>Phone numbers</h2>
              <p>Pakistani numbers (e.g. 0300-1234567) are always accepted.</p>
            </div>
          </div>
          <label className="settings-row">
            <span className="settings-label">
              Allow international numbers
              <small>For overseas clients. Numbers must start with + and a country code, e.g. +971501234567.</small>
            </span>
            <input type="checkbox" className="switch" {...register("allowInternationalPhones")} />
          </label>
        </section>

        <section className="card settings-card">
          <div className="settings-card-head">
            <span className="header-icon blue"><Clock size={18} /></span>
            <div>
              <h2>Timezone</h2>
              <p>Dates and times on quotes, invoices and the dashboard use this timezone.</p>
            </div>
          </div>
          <div className="settings-row">
            <span className="settings-label">Shop timezone</span>
            <span className="settings-value">Pakistan Time (PKT, UTC+5) · {timezone}</span>
          </div>
        </section>

        {canEdit && (
          <div className="settings-actions">
            <button type="submit" className="button button-primary" disabled={!isDirty || isSubmitting}>
              {isSubmitting ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
              {isSubmitting ? "Saving…" : "Save Settings"}
            </button>
          </div>
        )}
      </fieldset>
    </form>
  );
}
