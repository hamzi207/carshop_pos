"use client";

import { useEffect, useRef, useState } from "react";
import type {
  VehicleMakesResponse,
  VehicleModelOption,
  VehicleModelsResponse,
  VehicleYearsResponse,
} from "@/lib/types/vehicle";

// Always asks the server: the catalog changes when the seed runs or a shop adds a
// vehicle, and a cached list would hide the new years and models.
async function getJson<T>(url: string, signal: AbortSignal): Promise<T> {
  const res = await fetch(url, { signal, cache: "no-store" });
  if (!res.ok) throw new Error(`Vehicle lookup failed (${res.status})`);
  return res.json() as Promise<T>;
}

const makesUrl = (year: number) => `/api/vehicles?year=${year}`;
const modelsUrl = (year: number, make: string) => `/api/vehicles?year=${year}&make=${encodeURIComponent(make)}`;

/**
 * Cascading Year → Make → Model lookups against /api/vehicles, shared by the
 * inventory fitment selector and the quote builder. Changing the year keeps
 * the make when that year has it ("same model, another year"). `initial`
 * pre-selects a year and make, e.g. when reopening a saved quote.
 */
export function useVehicleCascade(initial?: { year: number; make: string }) {
  const [years, setYears] = useState<number[]>([]);
  const [year, setYear] = useState<number | "">(initial?.year ?? "");
  const [makes, setMakes] = useState<string[]>([]);
  const [make, setMake] = useState(initial?.make ?? "");
  const [models, setModels] = useState<VehicleModelOption[]>([]);
  const [loading, setLoading] = useState<"years" | "makes" | "models" | null>("years");
  const [error, setError] = useState<string | null>(null);

  // Years (plus the initial year's makes and models) load once on mount.
  const initialYear = initial?.year;
  const initialMake = initial?.make;
  useEffect(() => {
    const ctrl = new AbortController();
    Promise.all([
      getJson<VehicleYearsResponse>("/api/vehicles", ctrl.signal),
      initialYear ? getJson<VehicleMakesResponse>(makesUrl(initialYear), ctrl.signal) : null,
      initialYear && initialMake ? getJson<VehicleModelsResponse>(modelsUrl(initialYear, initialMake), ctrl.signal) : null,
    ])
      .then(([y, m, mo]) => {
        setYears(y.years);
        if (m) setMakes(m.makes);
        if (mo) setModels(mo.models);
      })
      .catch((err) => !ctrl.signal.aborted && setError(err.message))
      .finally(() => !ctrl.signal.aborted && setLoading(null));
    return () => ctrl.abort();
  }, [initialYear, initialMake]);

  // Abort whichever makes/models lookup is in flight when a newer one starts
  // (or the component unmounts), so a slow response can't overwrite a newer one.
  const pending = useRef<AbortController | null>(null);
  useEffect(() => () => pending.current?.abort(), []);

  const lookup = async <T,>(url: string, stage: "makes" | "models"): Promise<T | null> => {
    pending.current?.abort();
    const ctrl = new AbortController();
    pending.current = ctrl;
    setLoading(stage);
    setError(null);
    try {
      return await getJson<T>(url, ctrl.signal);
    } catch (err) {
      if (!ctrl.signal.aborted) setError(err instanceof Error ? err.message : "Lookup failed");
      return null;
    } finally {
      if (!ctrl.signal.aborted) setLoading(null);
    }
  };

  const loadModels = async (y: number, m: string) => {
    setModels([]);
    const body = await lookup<VehicleModelsResponse>(modelsUrl(y, m), "models");
    if (body) setModels(body.models);
  };

  /** Returns the make that stays selected ("" when the new year doesn't have it). */
  const selectYear = async (next: number | ""): Promise<string> => {
    setYear(next);
    setMakes([]);
    setModels([]);
    if (next === "") {
      pending.current?.abort();
      setMake("");
      return "";
    }
    const body = await lookup<VehicleMakesResponse>(makesUrl(next), "makes");
    if (!body) return "";
    setMakes(body.makes);
    if (make && body.makes.includes(make)) {
      await loadModels(next, make);
      return make;
    }
    setMake("");
    return "";
  };

  const selectMake = (next: string) => {
    setMake(next);
    if (year !== "" && next) void loadModels(year, next);
    else setModels([]);
  };

  /** After a vehicle is added: reload the lists and select its year and make. */
  const showAdded = async (y: number, m: string) => {
    setYear(y);
    setMake(m);
    setModels([]);
    const yearsBody = await lookup<VehicleYearsResponse>("/api/vehicles", "makes");
    if (yearsBody) setYears(yearsBody.years);
    const makesBody = await lookup<VehicleMakesResponse>(makesUrl(y), "makes");
    if (makesBody) setMakes(makesBody.makes);
    const modelsBody = await lookup<VehicleModelsResponse>(modelsUrl(y, m), "models");
    if (modelsBody) setModels(modelsBody.models);
  };

  return { years, year, makes, make, models, loading, error, selectYear, selectMake, showAdded };
}
