"use client";

import { useState, useTransition } from "react";
import { ArrowRight, Blocks, Building2, CheckCircle2, Circle, ListChecks, Loader2 } from "lucide-react";
import { changeTenantIndustry, previewIndustryChange, setTenantModules } from "@/lib/actions/admin-categories";
import type { getTenantIndustryView, RemapRow } from "@/lib/admin-category-data";
import { MODULES } from "@/lib/modules";
import { notify } from "@/lib/notify";
import { stepInfo } from "@/lib/onboarding";

type View = Awaited<ReturnType<typeof getTenantIndustryView>>;
type Plan = { rows: RemapRow[]; targets: { id: string; path: string; own: boolean }[] };

function IndustryChange({ tenantId, view }: { tenantId: string; view: View }) {
  const current = view.industries.find((i) => i.id === view.industryId);
  const [target, setTarget] = useState("");
  const [plan, setPlan] = useState<Plan | null>(null);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [pending, startTransition] = useTransition();

  const preview = (industryId: string) => {
    setTarget(industryId);
    setPlan(null);
    if (!industryId) return;
    startTransition(async () => {
      const result = await previewIndustryChange(tenantId, industryId);
      if (result.status === "error") {
        notify.error("Can't change the industry", result.message);
        return;
      }
      setPlan({ rows: result.rows, targets: result.targets });
      setMapping(Object.fromEntries(result.rows.filter((r) => r.suggestion).map((r) => [r.categoryId, r.suggestion!])));
    });
  };

  const unmapped = plan ? plan.rows.filter((r) => !mapping[r.categoryId]).length : 0;
  const apply = () =>
    startTransition(async () => {
      const result = await changeTenantIndustry(tenantId, target, mapping);
      if (result.status === "error") {
        notify.error("Industry not changed", result.message);
        return;
      }
      notify.success("Industry changed", result.message);
      setTarget("");
      setPlan(null);
    });

  return (
    <section className="card settings-card">
      <div className="settings-card-head">
        <span className="header-icon blue"><Building2 size={18} /></span>
        <div>
          <h2>Industry: {current?.name ?? "Unknown"}</h2>
          <p>Changing it swaps the category catalog. Every item in a category that won&apos;t exist afterwards needs a new one; the organization&apos;s own main categories stay.</p>
        </div>
        {pending && <Loader2 size={15} className="animate-spin" />}
      </div>
      <div className="form-grid">
        <label>
          <span>MOVE TO</span>
          <select value={target} disabled={pending} onChange={(e) => preview(e.target.value)}>
            <option value="">Choose an industry…</option>
            {view.industries
              .filter((i) => i.id !== view.industryId)
              .map((i) => (
                <option key={i.id} value={i.id}>
                  {i.name} ({i.categories} categories){i.isActive ? "" : " · closed"}
                </option>
              ))}
          </select>
        </label>
      </div>
      {plan && (
        <div className="remap">
          {plan.rows.length === 0 ? (
            <p>None of the organization&apos;s items use a category that changes. Nothing to move.</p>
          ) : (
            <>
              <p>
                {plan.rows.length} categories with items need a new home. Matching paths and names are filled in; {unmapped ? `${unmapped} still need one.` : "check them, then apply."}
              </p>
              <div className="table-wrap">
                <table className="admin-table">
                  <thead>
                    <tr>
                      <th>NOW</th>
                      <th className="numeric">ITEMS</th>
                      <th><span className="sr-only">to</span></th>
                      <th>NEW CATEGORY</th>
                    </tr>
                  </thead>
                  <tbody>
                    {plan.rows.map((r) => (
                      <tr key={r.categoryId}>
                        <td>{r.path}</td>
                        <td className="numeric">{r.items}</td>
                        <td><ArrowRight size={14} /></td>
                        <td>
                          <select
                            aria-label={`New category for ${r.path}`}
                            value={mapping[r.categoryId] ?? ""}
                            onChange={(e) => setMapping({ ...mapping, [r.categoryId]: e.target.value })}
                          >
                            <option value="">Choose…</option>
                            {plan.targets.map((t) => (
                              <option key={t.id} value={t.id}>
                                {t.path}
                                {t.own ? " (own)" : ""}
                              </option>
                            ))}
                          </select>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
          <div className="import-preview-actions">
            <button type="button" className="button" disabled={pending} onClick={() => preview("")}>Cancel</button>
            <button type="button" className="button button-primary" disabled={pending || unmapped > 0} onClick={apply}>
              Change industry{plan.rows.length ? ` and move ${plan.rows.reduce((n, r) => n + r.items, 0)} items` : ""}
            </button>
          </div>
        </div>
      )}
    </section>
  );
}

function Modules({ tenantId, view }: { tenantId: string; view: View }) {
  const [modules, setModules] = useState(view.modules);
  const [pending, startTransition] = useTransition();
  const save = (next: string[]) => {
    const before = modules;
    setModules(next);
    startTransition(async () => {
      const result = await setTenantModules(tenantId, next);
      if (result.status === "error") {
        setModules(before);
        notify.error("Not saved", result.message);
      } else notify.success("Modules saved");
    });
  };
  return (
    <section className="card settings-card">
      <div className="settings-card-head">
        <span className="header-icon blue"><Blocks size={18} /></span>
        <div>
          <h2>Modules</h2>
          <p>
            Optional features for this organization. {view.planName ? `Its plan (${view.planName}) ` : "Its plan "}
            {view.planModules === null ? "allows every module." : view.planModules.length ? "allows only some modules." : "allows no modules."}
          </p>
        </div>
        {pending && <Loader2 size={15} className="animate-spin" />}
      </div>
      <div className="module-switches">
        {MODULES.map((m) => {
          const on = modules.includes(m.key);
          const allowed = view.planModules === null || view.planModules.includes(m.key);
          return (
            <label key={m.key} className="check-field">
              <input type="checkbox" checked={on} disabled={pending} onChange={(e) => save(e.target.checked ? [...modules, m.key] : modules.filter((k) => k !== m.key))} />
              <div>
                <strong>
                  {m.label} {on && !allowed && <span className="badge badge-amber">Not in plan: off for them</span>}
                </strong>
                <small>
                  {m.key === "vehicle_fitment"
                    ? "Make / model / year compatibility on products, vehicle search and fitment columns. When off, fitment data is kept but hidden."
                    : "Optional module."}
                </small>
              </div>
            </label>
          );
        })}
      </div>
    </section>
  );
}

function Onboarding({ steps }: { steps: View["onboarding"] }) {
  const done = steps.filter((s) => s.done).length;
  return (
    <section className="card settings-card">
      <div className="settings-card-head">
        <span className="header-icon blue"><ListChecks size={18} /></span>
        <div>
          <h2>Setup checklist: {done} of {steps.length}</h2>
          <p>The organization&apos;s “Get started” steps, from its industry.</p>
        </div>
      </div>
      <ul className="onboarding-list">
        {steps.map((s) => (
          <li key={s.step} className={s.done ? "is-done" : undefined}>
            {s.done ? <CheckCircle2 size={16} /> : <Circle size={16} />} {stepInfo(s.step)?.label ?? s.step}
          </li>
        ))}
      </ul>
    </section>
  );
}

/** The console's Industry & modules tab. */
export function TenantIndustryPanel({ tenantId, view }: { tenantId: string; view: View }) {
  return (
    <>
      <IndustryChange tenantId={tenantId} view={view} />
      <Modules tenantId={tenantId} view={view} />
      {view.onboarding.length > 0 && <Onboarding steps={view.onboarding} />}
    </>
  );
}
