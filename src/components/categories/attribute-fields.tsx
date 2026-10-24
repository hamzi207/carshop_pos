"use client";

import type { Attribute, AttrValues } from "@/lib/attributes";

/**
 * Inputs for the attributes that apply to a product's category (RF-18.1). Renders form-grid cells, so it
 * sits inside the product dialog's grid (shop) or the console's product dialog.
 */
export function AttributeFields({ fields, values, onChange }: { fields: Attribute[]; values: AttrValues; onChange: (next: AttrValues) => void }) {
  return fields.map((a) => {
    const value = values[a.key];
    const set = (v: string | boolean) => onChange({ ...values, [a.key]: v });
    if (a.type === "boolean") {
      return (
        <label key={a.id} className="check-field">
          <input type="checkbox" checked={value === true} onChange={(e) => set(e.target.checked)} />
          <div>
            <strong>{a.label}</strong>
          </div>
        </label>
      );
    }
    return (
      <label key={a.id}>
        <span>{`${a.label.toUpperCase()}${a.is_required ? "" : " (OPTIONAL)"}`}</span>
        {a.type === "select" ? (
          <select value={String(value ?? "")} onChange={(e) => set(e.target.value)}>
            <option value="">—</option>
            {a.options.map((o) => (
              <option key={o} value={o}>{o}</option>
            ))}
          </select>
        ) : (
          <input
            type={a.type === "date" ? "date" : "text"}
            inputMode={a.type === "number" ? "decimal" : undefined}
            maxLength={a.type === "text" ? 200 : undefined}
            value={String(value ?? "")}
            onChange={(e) => set(e.target.value)}
          />
        )}
      </label>
    );
  });
}
