"use client";

import { useState } from "react";
import { Car, Loader2, Plus, X } from "lucide-react";
import { addVehicle } from "@/lib/actions/vehicles";
import { formatMake, formatVehicle } from "@/lib/format";
import { useVehicleCascade } from "@/lib/hooks/use-vehicle-cascade";
import type { FitmentVehicle } from "@/lib/types/inventory";

// Newest first; a vehicle can be added for any year the catalog accepts.
const ADD_YEARS = Array.from({ length: new Date().getFullYear() + 1 - 1960 + 1 }, (_, i) => new Date().getFullYear() + 1 - i);

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
  const { years, year, makes, make, models, loading, error: lookupError, selectYear, selectMake, showAdded } =
    useVehicleCascade();

  const selectedIds = new Set(value.map((v) => v.id));

  const addModel = (modelId: string) => {
    const option = models.find((m) => String(m.id) === modelId);
    if (!option || year === "" || selectedIds.has(option.id)) return;
    onChange([...value, { id: option.id, year, make, model: option.model, trim: option.trim }]);
  };

  const remove = (id: number) => onChange(value.filter((v) => v.id !== id));

  // "Vehicle not listed?": saved for this shop and linked to the part straight away.
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState({ year: "", make: "", model: "" });
  const [addError, setAddError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const openAdd = () => {
    setDraft({ year: year === "" ? "" : String(year), make: make ? formatMake(make) : "", model: "" });
    setAddError(null);
    setAdding(true);
  };

  const saveVehicle = async () => {
    setSaving(true);
    const result = await addVehicle({ year: Number(draft.year), make: draft.make, model: draft.model });
    setSaving(false);
    if (result.status === "error") return setAddError(result.message);
    const vehicle = result.vehicle;
    if (!selectedIds.has(vehicle.id)) onChange([...value, vehicle]);
    setAdding(false);
    void showAdded(vehicle.year, vehicle.make);
  };

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

      {adding ? (
        // Not a <form>: this sits inside the part dialog's form.
        <div
          className="ymm-add"
          role="group"
          aria-label="Add a vehicle that isn't listed"
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              if (!saving) void saveVehicle();
            } else if (e.key === "Escape") {
              e.stopPropagation();
              setAdding(false);
            }
          }}
        >
          <select aria-label="Year of the new vehicle" value={draft.year} onChange={(e) => setDraft({ ...draft, year: e.target.value })}>
            <option value="">Year</option>
            {ADD_YEARS.map((y) => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
          <input
            aria-label="Make of the new vehicle"
            placeholder="Make, e.g. Suzuki"
            maxLength={64}
            list="ymm-add-makes"
            value={draft.make}
            onChange={(e) => setDraft({ ...draft, make: e.target.value })}
          />
          <datalist id="ymm-add-makes">
            {makes.map((m) => (
              <option key={m} value={formatMake(m)} />
            ))}
          </datalist>
          <input
            aria-label="Model of the new vehicle"
            placeholder="Model, e.g. Mehran"
            maxLength={64}
            autoFocus
            value={draft.model}
            onChange={(e) => setDraft({ ...draft, model: e.target.value })}
          />
          <button
            type="button"
            className="ymm-add-save"
            disabled={saving || !draft.year || !draft.make.trim() || !draft.model.trim()}
            onClick={() => void saveVehicle()}
          >
            {saving ? <Loader2 size={13} className="animate-spin" /> : <Plus size={13} />} Add
          </button>
          <button type="button" className="ymm-add-cancel" aria-label="Cancel adding a vehicle" onClick={() => setAdding(false)}>
            <X size={14} />
          </button>
          {addError && <span className="field-error" role="alert">{addError}</span>}
        </div>
      ) : (
        <button type="button" className="ymm-add-link" onClick={openAdd}>
          <Plus size={12} /> Vehicle not listed? Add it
        </button>
      )}

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
