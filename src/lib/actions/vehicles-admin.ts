"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { audit, requireSuperadmin } from "@/lib/superadmin";
import { createAdminClient } from "@/lib/supabase/admin";
import type { AdminActionResult } from "./admin";

// /admin/platform/vehicles (Phase 17, deliverable 5): the global vehicle catalog. Superadmin only, audited.

const fail = (message: string): AdminActionResult => ({ status: "error", message });
const thisYear = () => new Date().getFullYear();

const vehicleSchema = z.object({
  year: z.coerce.number().int("Enter a year.").min(1960, "Years start at 1960.").refine((y) => y <= thisYear() + 1, `Years go up to ${thisYear() + 1}.`),
  make: z.string().trim().min(1, "Enter the make.").max(64).transform((v) => v.replace(/\s+/g, " ").toUpperCase()),
  model: z.string().trim().min(1, "Enter the model.").max(64).transform((v) => v.replace(/\s+/g, " ")),
  trim: z.string().trim().max(64).transform((v) => (v === "" ? null : v.replace(/\s+/g, " "))),
});
export type VehicleInput = z.input<typeof vehicleSchema>;

const duplicate = (code?: string) => code === "23505";
const label = (v: { year: number; make: string; model: string; trim: string | null }) => `${v.year} ${v.make} ${v.model}${v.trim ? ` ${v.trim}` : ""}`;

/** Adds a catalog row (available to every shop). */
export async function addCatalogVehicle(input: VehicleInput): Promise<AdminActionResult> {
  const me = await requireSuperadmin();
  const parsed = vehicleSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Check the vehicle.");
  const v = parsed.data;
  const { data, error } = await createAdminClient().from("vehicles").insert({ ...v, tenant_id: null }).select("id").single();
  if (error) {
    if (duplicate(error.code)) return fail(`${label(v)} is already in the catalog.`);
    console.error("addCatalogVehicle failed:", error);
    return fail("We couldn't add the vehicle. Please try again.");
  }
  await audit({ adminId: me.userId, action: "vehicle.create", details: { id: data.id, vehicle: label(v) } });
  refresh();
  return { status: "success", message: `${label(v)} was added to the catalog.` };
}

/** Fixes a row's year, make, model or trim (items and documents linked to it follow). */
export async function editVehicle(id: number, input: VehicleInput): Promise<AdminActionResult> {
  const me = await requireSuperadmin();
  if (!Number.isInteger(id) || id < 1) return fail("That vehicle wasn't found.");
  const parsed = vehicleSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Check the vehicle.");
  const admin = createAdminClient();
  const { data: before } = await admin.from("vehicles").select("year, make, model, trim").eq("id", id).maybeSingle();
  if (!before) return fail("That vehicle wasn't found.");
  const { error } = await admin.from("vehicles").update(parsed.data).eq("id", id);
  if (error) {
    if (duplicate(error.code)) return fail(`${label(parsed.data)} already exists. Merge the two instead.`);
    console.error("editVehicle failed:", error);
    return fail("We couldn't save the vehicle. Please try again.");
  }
  await audit({ adminId: me.userId, action: "vehicle.update", details: { id, before: label(before), after: label(parsed.data) } });
  refresh();
  return { status: "success" };
}

/** Hides rows from the pickers and CSV matching (linked items and documents keep them), or brings them back. */
export async function setVehiclesActive(ids: number[], active: boolean): Promise<AdminActionResult> {
  const me = await requireSuperadmin();
  if (!z.array(z.number().int().positive()).min(1).max(200).safeParse(ids).success) return fail("Choose up to 200 vehicles.");
  const { data, error } = await createAdminClient()
    .from("vehicles")
    .update({ deactivated_at: active ? null : new Date().toISOString() })
    .in("id", ids)
    .select("id");
  if (error) {
    console.error("setVehiclesActive failed:", error);
    return fail("We couldn't update the vehicles. Please try again.");
  }
  await audit({ adminId: me.userId, action: active ? "vehicle.reactivate" : "vehicle.deactivate", details: { ids, count: data.length } });
  refresh();
  return { status: "success", message: `${data.length} ${data.length === 1 ? "vehicle" : "vehicles"} ${active ? "reactivated" : "deactivated"}.` };
}

/** Merges duplicates into one row: their item links and documents move to it, then they're removed. */
export async function mergeVehicles(keepId: number, mergeIds: number[]): Promise<AdminActionResult> {
  const me = await requireSuperadmin();
  const others = mergeIds.filter((m) => m !== keepId);
  if (!Number.isInteger(keepId) || !z.array(z.number().int().positive()).min(1).max(50).safeParse(others).success) {
    return fail("Choose the vehicle to keep and at least one duplicate.");
  }
  const admin = createAdminClient();
  const { data: rows } = await admin.from("vehicles").select("id, year, make, model, trim").in("id", [keepId, ...others]);
  const keep = rows?.find((r) => r.id === keepId);
  if (!keep) return fail("The vehicle to keep wasn't found.");
  const { data, error } = await admin.rpc("admin_merge_vehicles", { p_keep: keepId, p_merge: others });
  if (error) {
    if (error.code === "22023") return fail(error.message);
    console.error("mergeVehicles failed:", error);
    return fail("We couldn't merge the vehicles. Please try again.");
  }
  await audit({
    adminId: me.userId,
    action: "vehicle.merge",
    details: { kept: label(keep), keptId: keepId, merged: (rows ?? []).filter((r) => r.id !== keepId).map(label) },
  });
  refresh();
  return { status: "success", message: `${data} merged into ${label(keep)}.` };
}
