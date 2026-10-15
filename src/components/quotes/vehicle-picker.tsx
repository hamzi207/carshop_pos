"use client";

import { Loader2, X } from "lucide-react";
import { formatMake } from "@/lib/format";
import { useVehicleCascade } from "@/lib/hooks/use-vehicle-cascade";
import type { FitmentVehicle } from "@/lib/types/inventory";

type Props = {
  value: FitmentVehicle | null;
  onChange: (vehicle: FitmentVehicle | null) => void;
  disabled?: boolean;
};

/** Year → Make → Model for one vehicle. Optional: parts-only sales can skip it. */
export function VehiclePicker({ value, onChange, disabled }: Props) {
  const { years, year, makes, make, models, loading, error, selectYear, selectMake } = useVehicleCascade(
    value ? { year: value.year, make: value.make } : undefined,
  );

  const pickModel = (id: string) => {
    const option = models.find((m) => String(m.id) === id);
    if (!option || year === "") {
      onChange(null);
      return;
    }
    onChange({ id: option.id, year, make, model: option.model, trim: option.trim });
  };

  return (
    <>
      <label className="field">
        <span className="field-label">YEAR</span>
        <select
          className="field-select"
          value={year}
          disabled={disabled || years.length === 0}
          onChange={(e) => {
            onChange(null);
            void selectYear(e.target.value ? Number(e.target.value) : "");
          }}
        >
          <option value="">{loading === "years" ? "Loading…" : "Year"}</option>
          {years.map((y) => (
            <option key={y} value={y}>{y}</option>
          ))}
        </select>
      </label>
      <label className="field">
        <span className="field-label">MAKE</span>
        <select
          className="field-select"
          value={make}
          disabled={disabled || year === "" || loading === "makes"}
          onChange={(e) => {
            onChange(null);
            selectMake(e.target.value);
          }}
        >
          <option value="">{loading === "makes" ? "Loading…" : "Make"}</option>
          {makes.map((m) => (
            <option key={m} value={m}>{formatMake(m)}</option>
          ))}
        </select>
      </label>
      <label className="field">
        <span className="field-label">
          MODEL
          {loading === "models" && <Loader2 size={10} className="animate-spin" aria-label="Loading models" />}
        </span>
        <span className="field-select-wrap">
          <select
            className="field-select"
            value={value ? String(value.id) : ""}
            disabled={disabled || !make || loading === "models"}
            onChange={(e) => pickModel(e.target.value)}
          >
            <option value="">{loading === "models" ? "Loading…" : "Model"}</option>
            {models.map((m) => (
              <option key={m.id} value={m.id}>
                {m.model}{m.trim ? ` ${m.trim}` : ""}
              </option>
            ))}
          </select>
          {value && !disabled && (
            <button type="button" className="icon-button" aria-label="Clear vehicle" title="Clear vehicle" onClick={() => onChange(null)}>
              <X size={14} />
            </button>
          )}
        </span>
        {error && <span className="field-error">{error}</span>}
      </label>
    </>
  );
}
