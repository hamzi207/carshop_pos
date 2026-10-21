"use client";

import { useState } from "react";
import { Dialog } from "radix-ui";
import { AlertTriangle, Layers, Loader2, Save, X } from "lucide-react";
import { ModalSheet } from "@/components/shared/modal-sheet";
import { savePlan, type OverLimit } from "@/lib/actions/plans";
import { MODULES } from "@/lib/modules";
import { notify } from "@/lib/notify";
import type { PlanInput } from "@/lib/validations/plan.schema";

/** What the form starts from: an existing plan (edit), a copy (duplicate) or blanks (new). */
export type PlanDraft = {
  id?: string;
  name: string;
  code: string;
  description: string;
  visibility: "standard" | "custom";
  priceMonthly: number | null;
  priceYearly: number | null;
  maxStores: number | null;
  maxUsers: number | null;
  maxProducts: number | null;
  modules: string[] | null;
  trialDays: number;
  sortOrder: number;
};

export const EMPTY_PLAN: PlanDraft = {
  name: "",
  code: "",
  description: "",
  visibility: "standard",
  priceMonthly: null,
  priceYearly: null,
  maxStores: null,
  maxUsers: null,
  maxProducts: null,
  modules: null,
  trialDays: 14,
  sortOrder: 50,
};

/** "Business Plus" → "business-plus" */
export const codeFrom = (name: string) =>
  name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40);

const str = (v: number | null) => (v === null ? "" : String(v));
const numOrNull = (v: string) => (v.trim() === "" ? null : Number(v.replace(/,/g, "")));

type Props = {
  draft: PlanDraft | null;
  title: string;
  onClose: () => void;
  /** Called with the saved plan's id (e.g. to assign it right away). */
  onSaved?: (id: string) => void | Promise<void>;
  submitLabel?: string;
};

/** Create / edit / duplicate a subscription plan (/admin/plans, and "Create custom plan" on an organization). */
export function PlanFormDialog({ draft, title, onClose, onSaved, submitLabel }: Props) {
  return (
    <Dialog.Root open={draft !== null} onOpenChange={(open) => !open && onClose()}>
      <ModalSheet className="modal">
        {draft && <PlanForm draft={draft} title={title} onClose={onClose} onSaved={onSaved} submitLabel={submitLabel} />}
      </ModalSheet>
    </Dialog.Root>
  );
}

function PlanForm({ draft, title, onClose, onSaved, submitLabel }: Props & { draft: PlanDraft }) {
  const [v, setV] = useState({
    name: draft.name,
    code: draft.code,
    codeTouched: Boolean(draft.id || draft.code),
    description: draft.description,
    visibility: draft.visibility,
    priceMonthly: str(draft.priceMonthly),
    priceYearly: str(draft.priceYearly),
    maxStores: str(draft.maxStores),
    maxUsers: str(draft.maxUsers),
    maxProducts: str(draft.maxProducts),
    allModules: draft.modules === null,
    modules: draft.modules ?? [],
    trialDays: String(draft.trialDays),
    sortOrder: String(draft.sortOrder),
  });
  const [error, setError] = useState<string | null>(null);
  const [over, setOver] = useState<OverLimit[] | null>(null);
  const [busy, setBusy] = useState(false);
  const set = <K extends keyof typeof v>(key: K, value: (typeof v)[K]) => setV((prev) => ({ ...prev, [key]: value }));

  const input = (): PlanInput => ({
    name: v.name,
    code: v.code,
    description: v.description,
    visibility: v.visibility,
    priceMonthly: numOrNull(v.priceMonthly),
    priceYearly: numOrNull(v.priceYearly),
    maxStores: numOrNull(v.maxStores),
    maxUsers: numOrNull(v.maxUsers),
    maxProducts: numOrNull(v.maxProducts),
    modules: v.allModules ? null : v.modules,
    trialDays: Number(v.trialDays || 0),
    sortOrder: Number(v.sortOrder || 0),
  });

  const submit = async (confirmed: boolean) => {
    setBusy(true);
    setError(null);
    const values = input();
    const bad = Object.entries(values).find(([, x]) => typeof x === "number" && !Number.isFinite(x));
    if (bad) {
      setBusy(false);
      setError("Numbers only, please (leave a limit empty for unlimited).");
      return;
    }
    const result = await savePlan(values, draft.id, confirmed);
    if (result.status === "error") {
      setBusy(false);
      setError(result.message);
      return;
    }
    if (result.status === "confirm") {
      setBusy(false);
      setOver(result.over);
      return;
    }
    await onSaved?.(result.id);
    notify.success(draft.id ? "Plan saved" : "Plan created", result.message);
    onClose();
  };

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void submit(false);
      }}
      noValidate
    >
      <div className="modal-header">
        <div>
          <span className="header-icon blue"><Layers size={18} /></span>
          <div>
            <Dialog.Title asChild><h2>{title}</h2></Dialog.Title>
            <Dialog.Description asChild>
              <p>Limits apply to every organization on the plan at once. A new price applies from each one&apos;s next invoice.</p>
            </Dialog.Description>
          </div>
        </div>
        <Dialog.Close asChild>
          <button type="button" className="icon-button" aria-label="Close"><X size={16} /></button>
        </Dialog.Close>
      </div>
      <div className="modal-body">
        {error && <div className="form-alert form-alert-error modal-alert" role="alert">{error}</div>}
        {over && (
          <div className="form-alert form-alert-warning modal-alert" role="alert">
            <strong><AlertTriangle size={13} /> {over.length === 1 ? "1 organization" : `${over.length} organizations`} would be over the new limits.</strong>
            <ul className="plan-over-list">
              {over.map((o) => (
                <li key={`${o.tenantId}-${o.kind}`}>
                  {o.tenantName}: {o.usage} {o.kind} (new limit {o.limit})
                </li>
              ))}
            </ul>
            Nothing is removed: they just can&apos;t add more {over.some((o) => o.kind === "users") ? "users" : "products"} until they&apos;re under the limit.
            Give one an override on its Subscription tab if it should keep growing.
          </div>
        )}
        <fieldset className="form-grid" disabled={busy}>
          <label>
            <span>PLAN NAME</span>
            <input
              value={v.name}
              maxLength={60}
              autoFocus
              placeholder="e.g. Business Plus"
              onChange={(e) => setV((p) => ({ ...p, name: e.target.value, code: p.codeTouched ? p.code : codeFrom(e.target.value) }))}
            />
          </label>
          <label>
            <span>CODE</span>
            <input value={v.code} maxLength={40} placeholder="business-plus" onChange={(e) => setV((p) => ({ ...p, code: e.target.value, codeTouched: true }))} />
          </label>
          <label className="span-two">
            <span>DESCRIPTION (OPTIONAL)</span>
            <input value={v.description} maxLength={500} placeholder="Who it's for" onChange={(e) => set("description", e.target.value)} />
          </label>
          <label>
            <span>MONTHLY PRICE (PKR)</span>
            <input inputMode="decimal" value={v.priceMonthly} placeholder="Empty = not offered" onChange={(e) => set("priceMonthly", e.target.value)} />
          </label>
          <label>
            <span>YEARLY PRICE (PKR)</span>
            <input inputMode="decimal" value={v.priceYearly} placeholder="Empty = not offered" onChange={(e) => set("priceYearly", e.target.value)} />
          </label>
          <label>
            <span>MAX STORES</span>
            <input inputMode="numeric" value={v.maxStores} placeholder="Unlimited" onChange={(e) => set("maxStores", e.target.value)} />
          </label>
          <label>
            <span>MAX USERS</span>
            <input inputMode="numeric" value={v.maxUsers} placeholder="Unlimited" onChange={(e) => set("maxUsers", e.target.value)} />
            <small>Active members; deactivated ones don&apos;t count.</small>
          </label>
          <label>
            <span>MAX PRODUCTS</span>
            <input inputMode="numeric" value={v.maxProducts} placeholder="Unlimited" onChange={(e) => set("maxProducts", e.target.value)} />
          </label>
          <label>
            <span>TRIAL DAYS</span>
            <input inputMode="numeric" value={v.trialDays} onChange={(e) => set("trialDays", e.target.value)} />
            <small>Used when the plan starts as a trial. 0 = no trial.</small>
          </label>
          <div className="span-two plan-modules">
            <span className="field-label">MODULES</span>
            <label className="check-field">
              <input type="checkbox" checked={v.allModules} onChange={(e) => set("allModules", e.target.checked)} />
              <div><strong>All modules</strong><p>Including any added later.</p></div>
            </label>
            {!v.allModules &&
              MODULES.map((m) => (
                <label key={m.key} className="check-field">
                  <input
                    type="checkbox"
                    checked={v.modules.includes(m.key)}
                    onChange={(e) => set("modules", e.target.checked ? [...v.modules, m.key] : v.modules.filter((k) => k !== m.key))}
                  />
                  <div><strong>{m.label}</strong></div>
                </label>
              ))}
          </div>
          <label>
            <span>VISIBILITY</span>
            <select value={v.visibility} onChange={(e) => set("visibility", e.target.value as "standard" | "custom")}>
              <option value="standard">Standard: listed, can be the sign-up default</option>
              <option value="custom">Custom: one negotiated deal</option>
            </select>
          </label>
          <label>
            <span>DISPLAY ORDER</span>
            <input inputMode="numeric" value={v.sortOrder} onChange={(e) => set("sortOrder", e.target.value)} />
            <small>Lower comes first.</small>
          </label>
        </fieldset>
      </div>
      <div className="modal-footer">
        <Dialog.Close asChild>
          <button type="button" className="button" disabled={busy}>Cancel</button>
        </Dialog.Close>
        {over ? (
          <button type="button" className="button button-primary" disabled={busy} onClick={() => void submit(true)}>
            {busy ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} Save anyway
          </button>
        ) : (
          <button type="submit" className="button button-primary" disabled={busy}>
            {busy ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} {submitLabel ?? (draft.id ? "Save Plan" : "Create Plan")}
          </button>
        )}
      </div>
    </form>
  );
}
