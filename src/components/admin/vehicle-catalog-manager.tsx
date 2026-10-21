"use client";

import { useState, useTransition } from "react";
import { CarFront, Combine, EyeOff, Pencil, Plus, RotateCcw } from "lucide-react";
import { SubscriptionDialog, useSubmit } from "@/components/subscription/subscription-dialog";
import { addCatalogVehicle, editVehicle, mergeVehicles, setVehiclesActive, type VehicleInput } from "@/lib/actions/vehicles-admin";
import type { VehicleRow } from "@/lib/admin-data";
import { notify } from "@/lib/notify";

const label = (v: Pick<VehicleRow, "year" | "make" | "model" | "trim">) => `${v.year} ${v.make} ${v.model}${v.trim ? ` ${v.trim}` : ""}`;

function VehicleDialog({ row, onClose }: { row: VehicleRow | null; onClose: () => void }) {
  const [v, setV] = useState<VehicleInput>({ year: row?.year ?? new Date().getFullYear(), make: row?.make ?? "", model: row?.model ?? "", trim: row?.trim ?? "" });
  const { busy, error, run } = useSubmit(onClose, row ? "Vehicle saved" : "Vehicle added");
  return (
    <SubscriptionDialog
      open
      onClose={onClose}
      icon={CarFront}
      title={row ? `Edit ${label(row)}` : "Add a vehicle to the catalog"}
      description={row ? "Items and documents linked to it show the new details." : "Every shop can pick it straight away."}
      submitLabel={row ? "Save Vehicle" : "Add Vehicle"}
      busy={busy}
      error={error}
      onSubmit={() => void run(() => (row ? editVehicle(row.id, v) : addCatalogVehicle(v)))}
    >
      <label>
        <span>YEAR</span>
        <input type="number" inputMode="numeric" min={1960} value={String(v.year)} onChange={(e) => setV({ ...v, year: e.target.value })} />
      </label>
      <label>
        <span>MAKE</span>
        <input value={v.make} maxLength={64} placeholder="TOYOTA" onChange={(e) => setV({ ...v, make: e.target.value })} />
      </label>
      <label>
        <span>MODEL</span>
        <input value={v.model} maxLength={64} placeholder="Corolla" onChange={(e) => setV({ ...v, model: e.target.value })} />
      </label>
      <label>
        <span>TRIM (OPTIONAL)</span>
        <input value={v.trim ?? ""} maxLength={64} placeholder="GLi" onChange={(e) => setV({ ...v, trim: e.target.value })} />
      </label>
    </SubscriptionDialog>
  );
}

function MergeDialog({ rows, onClose }: { rows: VehicleRow[]; onClose: () => void }) {
  // Keep a catalog row if there is one, else the most used.
  const best = [...rows].sort((a, b) => Number(a.tenant_id !== null) - Number(b.tenant_id !== null) || Number(b.items) + Number(b.documents) - (Number(a.items) + Number(a.documents)))[0]!;
  const [keep, setKeep] = useState(best.id);
  const { busy, error, run } = useSubmit(onClose, "Vehicles merged");
  return (
    <SubscriptionDialog
      open
      onClose={onClose}
      icon={Combine}
      destructive
      title={`Merge ${rows.length} vehicles`}
      description="Choose the row to keep. Items and documents on the others move to it, then the others are removed. This can't be undone."
      submitLabel="Merge"
      busy={busy}
      error={error}
      onSubmit={() => void run(() => mergeVehicles(keep, rows.map((r) => r.id)))}
    >
      <div className="span-two merge-choices" role="radiogroup" aria-label="Vehicle to keep">
        {rows.map((r) => (
          <label key={r.id} className="merge-choice">
            <input type="radio" name="keep" checked={keep === r.id} onChange={() => setKeep(r.id)} />
            <span>
              <strong>{label(r)}</strong>
              <small>
                {r.tenant_name ? `Added by ${r.tenant_name}` : "Catalog"} · {Number(r.items)} items · {Number(r.documents)} documents
                {r.deactivated_at ? " · deactivated" : ""}
              </small>
            </span>
          </label>
        ))}
      </div>
    </SubscriptionDialog>
  );
}

/** /admin/platform/vehicles: search results with add, edit, deactivate / reactivate and merge. */
export function VehicleCatalogManager({ rows }: { rows: VehicleRow[] }) {
  const [selected, setSelected] = useState<number[]>([]);
  const [dialog, setDialog] = useState<{ kind: "add" } | { kind: "edit"; row: VehicleRow } | { kind: "merge" } | null>(null);
  const [pending, startTransition] = useTransition();
  const chosen = rows.filter((r) => selected.includes(r.id));
  const toggle = (id: number) => setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  const close = () => {
    setDialog(null);
    setSelected([]);
  };

  const setActive = (active: boolean) =>
    startTransition(async () => {
      const result = await setVehiclesActive(selected, active);
      if (result.status === "error") notify.error("Not updated", result.message);
      else {
        notify.success(active ? "Reactivated" : "Deactivated", result.message);
        setSelected([]);
      }
    });

  return (
    <>
      <div className="vehicle-toolbar">
        <span>{selected.length ? `${selected.length} selected` : "Select rows to deactivate or merge them."}</span>
        {selected.length > 0 && (
          <>
            <button type="button" className="button" disabled={pending} onClick={() => setActive(false)}><EyeOff size={14} /> Deactivate</button>
            <button type="button" className="button" disabled={pending} onClick={() => setActive(true)}><RotateCcw size={14} /> Reactivate</button>
            <button type="button" className="button" disabled={pending || selected.length < 2} onClick={() => setDialog({ kind: "merge" })}><Combine size={14} /> Merge</button>
          </>
        )}
        <button type="button" className="button button-primary" onClick={() => setDialog({ kind: "add" })}><Plus size={14} /> Add Vehicle</button>
      </div>
      {rows.length === 0 ? (
        <div className="empty-state"><span className="header-icon blue"><CarFront size={18} /></span><strong>No vehicles match</strong></div>
      ) : (
        <div className="table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th><span className="sr-only">Select</span></th>
                <th>VEHICLE</th>
                <th>SOURCE</th>
                <th>ITEMS</th>
                <th>DOCUMENTS</th>
                <th><span className="sr-only">Edit</span></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className={r.deactivated_at ? "is-off" : undefined}>
                  <td><input type="checkbox" aria-label={`Select ${label(r)}`} checked={selected.includes(r.id)} onChange={() => toggle(r.id)} /></td>
                  <td className="primary-cell">
                    <strong>{label(r)}</strong>
                    {r.deactivated_at && <span>Deactivated: hidden from pickers</span>}
                  </td>
                  <td>{r.tenant_name ? <span className="badge badge-amber">{r.tenant_name}</span> : <span className="badge badge-muted">Catalog</span>}</td>
                  <td>{Number(r.items)}</td>
                  <td>{Number(r.documents)}</td>
                  <td>
                    <button type="button" className="icon-button" aria-label={`Edit ${label(r)}`} onClick={() => setDialog({ kind: "edit", row: r })}>
                      <Pencil size={14} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {dialog?.kind === "add" && <VehicleDialog row={null} onClose={close} />}
      {dialog?.kind === "edit" && <VehicleDialog row={dialog.row} onClose={close} />}
      {dialog?.kind === "merge" && chosen.length > 1 && <MergeDialog rows={chosen} onClose={close} />}
    </>
  );
}
