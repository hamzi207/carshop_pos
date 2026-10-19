"use client";

import { useState } from "react";
import { Controller, useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { AlarmClock, Clock, Coins, FileText, Phone, Receipt } from "lucide-react";
import { updateShopSettings } from "@/lib/actions/settings";
import { useUnsavedSettings } from "./unsaved-settings";
import { formatMoney } from "@/lib/format";
import { notify } from "@/lib/notify";
import { DEFAULT_TIMEZONE, type TimeZoneGroup } from "@/lib/timezones";
import {
  CLOCK_STYLES,
  CURRENCIES,
  PRINT_FORMAT_LABEL,
  PRINT_FORMATS,
  shopSettingsSchema,
  WEEK_START_LABEL,
  WEEK_STARTS,
  type ShopSettingsInput,
} from "@/lib/validations/settings.schema";

const onOff = (on: boolean) => (on ? "On" : "Off");

/**
 * "Settings saved" names each changed setting as "<label> updated to <value>", in the order the
 * cards show them; settings that weren't changed aren't mentioned.
 */
const CHANGE_TEXT: Record<keyof ShopSettingsInput, [label: string, value: (v: ShopSettingsInput) => string]> = {
  currency: ["Currency symbol", (v) => v.currency],
  showPaisa: ["Show paisa", (v) => onOff(v.showPaisa)],
  taxRate: ["Tax rate", (v) => `${v.taxRate}%`],
  pricesIncludeTax: ["Selling prices include tax", (v) => onOff(v.pricesIncludeTax)],
  quoteValidityDays: ["Quotation valid for", (v) => `${v.quoteValidityDays} day${v.quoteValidityDays === 1 ? "" : "s"}`],
  printFormat: ["Print format", (v) => PRINT_FORMAT_LABEL[v.printFormat]],
  allowInternationalPhones: ["Allow international numbers", (v) => onOff(v.allowInternationalPhones)],
  timezone: ["Shop timezone", (v) => v.timezone],
  weekStart: ["First day of the week", (v) => WEEK_START_LABEL[v.weekStart]],
  showClock: ["Show clock on dashboard", (v) => onOff(v.showClock)],
  clockStyle: ["Clock design", (v) => (v.clockStyle === "analog" ? "Analog" : "Digital")],
  clock24Hour: ["Time format", (v) => (v.clock24Hour ? "24-hour" : "12-hour")],
};

/** One line per changed setting, e.g. "Print format updated to 80mm POS slip."; empty when nothing changed. */
function describeChanges(before: ShopSettingsInput, after: ShopSettingsInput) {
  return (Object.keys(CHANGE_TEXT) as (keyof ShopSettingsInput)[])
    .filter((k) => before[k] !== after[k])
    .map((k) => `${CHANGE_TEXT[k][0]} updated to ${CHANGE_TEXT[k][1](after)}.`)
    .join("\n");
}

type Props = {
  initial: ShopSettingsInput;
  /** Built on the server so labels match between SSR and hydration. */
  timeZoneGroups: TimeZoneGroup[];
  /** Staff can see the settings but not change them. */
  canEdit: boolean;
};

export function ShopSettingsForm({ initial, timeZoneGroups, canEdit }: Props) {
  const [serverError, setServerError] = useState<string | null>(null);
  const {
    register,
    control,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting, isDirty, defaultValues: saved },
  } = useForm<ShopSettingsInput>({
    resolver: zodResolver(shopSettingsSchema),
    defaultValues: initial,
  });

  const [currency, showPaisa, showClock, clockStyle] = useWatch({
    control,
    name: ["currency", "showPaisa", "showClock", "clockStyle"],
  });
  const preview = formatMoney(12500, { currency, showPaisa });

  const persist = async (values: ShopSettingsInput) => {
    setServerError(null);
    const result = await updateShopSettings(values);
    if (result.status === "error") {
      setServerError(result.message);
      notify.error("Settings not saved", result.message);
      return false;
    }
    // Compared with the last saved values, so a setting changed and then changed back isn't listed.
    // `saved` = defaultValues, which reset() moves to the values just saved.
    const changes = describeChanges({ ...initial, ...saved } as ShopSettingsInput, values);
    reset(values);
    notify.success("Settings saved", changes || "Nothing was changed.");
    return true;
  };
  const onSubmit = handleSubmit(persist);
  // Saved only from the page's save bar (or Enter in a field); see unsaved-settings.tsx.
  useUnsavedSettings(
    "shop-settings",
    "Shop settings",
    isDirty,
    () => new Promise<boolean>((resolve) => void handleSubmit(async (v) => resolve(await persist(v)), () => resolve(false))()),
    () => {
      setServerError(null);
      reset();
    },
  );

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
            <span className="header-icon blue"><FileText size={18} /></span>
            <div>
              <h2>Quotations &amp; invoices</h2>
              <p>Parts on an open quotation are reserved until it is cancelled, deleted or invoiced.</p>
            </div>
          </div>
          <label className="settings-row">
            <span className="settings-label">
              Quotation valid for
              <small>Shown on each quotation. Expired quotations keep their stock reserved until you act on them.</small>
            </span>
            <span className="percent-input days-input">
              <input
                type="number"
                inputMode="numeric"
                step="1"
                min="1"
                max="365"
                aria-invalid={errors.quoteValidityDays ? true : undefined}
                {...register("quoteValidityDays", { valueAsNumber: true })}
              />
              <span>days</span>
            </span>
          </label>
          {errors.quoteValidityDays && <span className="field-error settings-error">{errors.quoteValidityDays.message}</span>}
          <div className="settings-row">
            <span className="settings-label">
              Print format
              <small>
                What quotations, invoices and drafts offer: an A4 PDF to view or download, or an 80mm slip printed straight from
                the screen on a receipt printer. The customer link always shows the A4 version.
              </small>
            </span>
            <Controller
              control={control}
              name="printFormat"
              render={({ field }) => (
                <div className="segmented" role="radiogroup" aria-label="Print format">
                  {PRINT_FORMATS.map((f) => (
                    <button
                      key={f}
                      type="button"
                      role="radio"
                      aria-checked={field.value === f}
                      className={field.value === f ? "active" : ""}
                      onClick={() => field.onChange(f)}
                    >
                      {PRINT_FORMAT_LABEL[f]}
                    </button>
                  ))}
                </div>
              )}
            />
          </div>

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
              <h2>Timezone &amp; week</h2>
              <p>Dates and times on quotes, invoices and the dashboard use this timezone.</p>
            </div>
          </div>
          <label className="settings-row">
            <span className="settings-label">
              Shop timezone
              <small>Default is Pakistan Time ({DEFAULT_TIMEZONE}, UTC+05:00).</small>
            </span>
            <select
              className="filter-select timezone-select"
              aria-invalid={errors.timezone ? true : undefined}
              {...register("timezone")}
            >
              {timeZoneGroups.map((g) => (
                <optgroup key={g.region} label={g.region}>
                  {g.options.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </optgroup>
              ))}
            </select>
          </label>
          {errors.timezone && <span className="field-error settings-error">{errors.timezone.message}</span>}
          <div className="settings-row">
            <span className="settings-label">
              First day of the week
              <small>Used for &ldquo;This week&rdquo; on the dashboard and in the date picker&apos;s calendar.</small>
            </span>
            <Controller
              control={control}
              name="weekStart"
              render={({ field }) => (
                <div className="segmented" role="radiogroup" aria-label="First day of the week">
                  {WEEK_STARTS.map((d) => (
                    <button
                      key={d}
                      type="button"
                      role="radio"
                      aria-checked={field.value === d}
                      className={field.value === d ? "active" : ""}
                      onClick={() => field.onChange(d)}
                    >
                      {WEEK_START_LABEL[d]}
                    </button>
                  ))}
                </div>
              )}
            />
          </div>
        </section>

        <section className="card settings-card">
          <div className="settings-card-head">
            <span className="header-icon blue"><AlarmClock size={18} /></span>
            <div>
              <h2>Dashboard clock</h2>
              <p>A live clock on the Overview page, in the shop timezone.</p>
            </div>
          </div>
          <label className="settings-row">
            <span className="settings-label">Show clock on dashboard</span>
            <input type="checkbox" className="switch" {...register("showClock")} />
          </label>
          <div className="settings-row">
            <span className="settings-label">
              Clock design
              {!showClock && <small>The clock is hidden. Turn it on to see this design.</small>}
            </span>
            <Controller
              control={control}
              name="clockStyle"
              render={({ field }) => (
                <div className="segmented" role="radiogroup" aria-label="Clock design">
                  {CLOCK_STYLES.map((s) => (
                    <button
                      key={s}
                      type="button"
                      role="radio"
                      aria-checked={field.value === s}
                      className={field.value === s ? "active" : ""}
                      onClick={() => field.onChange(s)}
                    >
                      {s === "digital" ? "Digital" : "Analog"}
                    </button>
                  ))}
                </div>
              )}
            />
          </div>
          {clockStyle === "digital" && (
            <div className="settings-row">
              <span className="settings-label">
                Time format
                <small>12-hour shows 4:05 PM; 24-hour shows 16:05.</small>
              </span>
              <Controller
                control={control}
                name="clock24Hour"
                render={({ field }) => (
                  <div className="segmented" role="radiogroup" aria-label="Time format">
                    {[false, true].map((is24) => (
                      <button
                        key={String(is24)}
                        type="button"
                        role="radio"
                        aria-checked={field.value === is24}
                        className={field.value === is24 ? "active" : ""}
                        onClick={() => field.onChange(is24)}
                      >
                        {is24 ? "24-hour" : "12-hour"}
                      </button>
                    ))}
                  </div>
                )}
              />
            </div>
          )}
        </section>
      </fieldset>
    </form>
  );
}
