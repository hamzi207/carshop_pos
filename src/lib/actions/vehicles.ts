"use server";

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import type { FitmentVehicle } from "@/lib/types/inventory";

// A vehicle missing from the catalog (e.g. a 1975 model, which NHTSA doesn't list).
// It is saved for this shop only; RPC add_vehicle returns the existing row when the
// catalog or the shop already has the same year, make and model.

export type AddVehicleResult = { status: "success"; vehicle: FitmentVehicle } | { status: "error"; message: string };

const vehicleSchema = z.object({
  year: z.coerce
    .number()
    .int()
    .min(1960, "Years start at 1960.")
    .max(new Date().getFullYear() + 1, "That year is too far ahead."),
  make: z.string().trim().min(1, "Enter the make.").max(64, "The make is too long."),
  model: z.string().trim().min(1, "Enter the model.").max(64, "The model is too long."),
});

export async function addVehicle(input: { year: number; make: string; model: string }): Promise<AddVehicleResult> {
  const parsed = vehicleSchema.safeParse(input);
  if (!parsed.success) return { status: "error", message: parsed.error.issues[0].message };

  const supabase = await createClient();
  const { data, error } = await supabase
    .rpc("add_vehicle", { p_year: parsed.data.year, p_make: parsed.data.make, p_model: parsed.data.model })
    .single();
  if (error) {
    if (error.code === "22023") return { status: "error", message: error.message };
    console.error("addVehicle failed:", error);
    return { status: "error", message: "We couldn't add this vehicle. Please try again." };
  }
  return { status: "success", vehicle: { ...data, trim: data.trim ?? null } };
}
