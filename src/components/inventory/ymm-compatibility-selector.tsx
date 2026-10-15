"use client";

import { Car, Loader2, X } from "lucide-react";
import { formatMake, formatVehicle } from "@/lib/format";
import { useVehicleCascade } from "@/lib/hooks/use-vehicle-cascade";
import type { FitmentVehicle } from "@/lib/types/inventory";

type Props = {
  value: FitmentVehicle[];
  onChange: (vehicles: FitmentVehicle[]) => void;
  error?: string;
};

/**
 * Links a part to Year / Make / Model records. Picking a model adds it as a
 * chip right away and keeps the year and make selected, so several models can
 * be added quickly. Changing the year keeps the make when that year has it,
 * which makes "same model, several years" a two-click job.
 */
export function YmmCompatibilitySelector({ value, onChange, error }: Props) {
  const { years, year, makes, make, models, loading, error: lookupError, selectYear, selectMake } = useVehicleCascade();

  const selectedIds = new Set(value.map((v) => v.id));

  const addModel = (modelId: string) => {
    const option = models.find((m) => String(m.id) === modelId);
    if (!option || year === "" || selectedIds.has(option.id)) return;
    onChange([...value, { id: option.id, year, make, model: option.model, trim: option.trim }]);
  };

  const remove = (id: number) => onChange(value.filter((v) => v.id !== id));

  return (
    <div className="vehicle-multi">
      <span>COMPATIBLE VEHICLES</span>
      <div className="ymm-pickers">
        <select
          aria-label="Model year"
          value={year}
          onChange={(e) => void selectYear(e.target.value ? Number(e.target.value) : "")}
          disabled={years.length === 0}
        >
          <option value="">{loading === "years" ? "Loading years…" : "Year"}</option>
          {years.map((y) => (
            <option key={y} value={y}>{y}</option>
          ))}
        </select>
        <select
          aria-label="Make"
          value={make}
          onChange={(e) => selectMake(e.target.value)}
          disabled={year === "" || loading === "makes"}
        >
          <option value="">{loading === "makes" ? "Loading makes…" : "Make"}</option>
          {makes.map((m) => (
            <option key={m} value={m}>{formatMake(m)}</option>
          ))}
        </select>
        <select
          aria-label="Model (adds the vehicle)"
          value=""
          onChange={(e) => addModel(e.target.value)}
          disabled={!make || loading === "models"}
        >
          <option value="">
            {loading === "models" ? "Loading models…" : make ? "Add model…" : "Model"}
          </option>
          {models.map((m) => (
            <option key={m.id} value={m.id} disabled={selectedIds.has(m.id)}>
              {m.model}{m.trim ? ` ${m.trim}` : ""}{selectedIds.has(m.id) ? " ✓" : ""}
            </option>
          ))}
        </select>
        {loading && <Loader2 size={14} className="animate-spin" aria-label="Loading" />}
      </div>

      <div className="vehicle-chips" aria-live="polite" aria-invalid={error ? true : undefined}>
        {value.length === 0 ? (
          <span className="vehicle-chips-empty">
            <Car size={14} /> Pick a year, make and model to link this part.
          </span>
        ) : (
          value.map((v) => {
            const label = formatVehicle(v);
            return (
              <span key={v.id} className="badge badge-blue">
                {label}
                <button type="button" onClick={() => remove(v.id)} aria-label={`Remove ${label}`}>
                  <X size={11} />
                </button>
              </span>
            );
          })
        )}
      </div>
      {(error || lookupError) && <span className="field-error">{error ?? lookupError}</span>}
    </div>
  );
}
