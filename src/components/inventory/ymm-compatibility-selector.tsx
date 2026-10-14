"use client";

import { useEffect, useRef, useState } from "react";
import { Car, Loader2, X } from "lucide-react";
import { formatMake, formatVehicle } from "@/lib/format";
import type { FitmentVehicle } from "@/lib/types/inventory";
import type {
  VehicleMakesResponse,
  VehicleModelOption,
  VehicleModelsResponse,
  VehicleYearsResponse,
} from "@/lib/types/vehicle";

type Props = {
  value: FitmentVehicle[];
  onChange: (vehicles: FitmentVehicle[]) => void;
  error?: string;
};

async function getJson<T>(url: string, signal: AbortSignal): Promise<T> {
  const res = await fetch(url, { signal });
  if (!res.ok) throw new Error(`Vehicle lookup failed (${res.status})`);
  return res.json() as Promise<T>;
}

/**
 * Links a part to Year / Make / Model records. Picking a model adds it as a
 * chip right away and keeps the year and make selected, so several models can
 * be added quickly. Changing the year keeps the make when that year has it,
 * which makes "same model, several years" a two-click job.
 */
export function YmmCompatibilitySelector({ value, onChange, error }: Props) {
  const [years, setYears] = useState<number[]>([]);
  const [year, setYear] = useState<number | "">("");
  const [makes, setMakes] = useState<string[]>([]);
  const [make, setMake] = useState("");
  const [models, setModels] = useState<VehicleModelOption[]>([]);
  const [loading, setLoading] = useState<"years" | "makes" | "models" | null>("years");
  const [lookupError, setLookupError] = useState<string | null>(null);

  useEffect(() => {
    const ctrl = new AbortController();
    getJson<VehicleYearsResponse>("/api/vehicles", ctrl.signal)
      .then((body) => setYears(body.years))
      .catch((err) => !ctrl.signal.aborted && setLookupError(err.message))
      .finally(() => !ctrl.signal.aborted && setLoading(null));
    return () => ctrl.abort();
  }, []);

  // Abort whichever makes/models lookup is in flight when a newer one starts
  // (or the selector unmounts), so a slow response can't overwrite a newer one.
  const pending = useRef<AbortController | null>(null);
  useEffect(() => () => pending.current?.abort(), []);

  const lookup = async <T,>(url: string, stage: "makes" | "models"): Promise<T | null> => {
    pending.current?.abort();
    const ctrl = new AbortController();
    pending.current = ctrl;
    setLoading(stage);
    setLookupError(null);
    try {
      return await getJson<T>(url, ctrl.signal);
    } catch (err) {
      if (!ctrl.signal.aborted) setLookupError(err instanceof Error ? err.message : "Lookup failed");
      return null;
    } finally {
      if (!ctrl.signal.aborted) setLoading(null);
    }
  };

  const loadModels = async (y: number, m: string) => {
    setModels([]);
    const body = await lookup<VehicleModelsResponse>(
      `/api/vehicles?year=${y}&make=${encodeURIComponent(m)}`,
      "models",
    );
    if (body) setModels(body.models);
  };

  const selectYear = async (next: number | "") => {
    setYear(next);
    setMakes([]);
    setModels([]);
    if (next === "") {
      pending.current?.abort();
      setMake("");
      return;
    }
    const body = await lookup<VehicleMakesResponse>(`/api/vehicles?year=${next}`, "makes");
    if (!body) return;
    setMakes(body.makes);
    // Keep the make when the new year has it: "same model, another year".
    if (make && body.makes.includes(make)) await loadModels(next, make);
    else setMake("");
  };

  const selectMake = (next: string) => {
    setMake(next);
    if (year !== "" && next) void loadModels(year, next);
    else setModels([]);
  };

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
