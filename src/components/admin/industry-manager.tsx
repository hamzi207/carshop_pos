"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Building2, FolderTree, Pencil, Plus, Trash2 } from "lucide-react";
import { SubscriptionDialog as FormDialog, useSubmit } from "@/components/subscription/subscription-dialog";
import { deleteIndustry, saveIndustry } from "@/lib/actions/admin-industries";
import type { Industry } from "@/lib/admin-category-data";
import { iconFor, ICON_NAMES } from "@/lib/category-icons";
import { MODULES, modulesText } from "@/lib/modules";
import { notify } from "@/lib/notify";
import { ONBOARDING_STEPS } from "@/lib/onboarding";

type Draft = {
  name: string;
  slug: string;
  description: string;
  icon: string;
  sortOrder: string;
  isActive: boolean;
  defaultModules: string[];
  defaultUoms: string;
  pricesIncludeTax: boolean;
  onboardingSteps: string[];
};

const ALL_STEPS = ONBOARDING_STEPS.map((s) => s.key as string);

const draftOf = (i: Industry | null): Draft => ({
  name: i?.name ?? "",
  slug: i?.slug ?? "",
  description: i?.description ?? "",
  icon: i?.icon ?? "store",
  sortOrder: String(i?.sortOrder ?? 100),
  isActive: i?.isActive ?? true,
  defaultModules: i?.defaultModules ?? [],
  defaultUoms: (i?.defaultUoms ?? ["pcs"]).join(", "),
  pricesIncludeTax: i?.pricesIncludeTax ?? true,
  onboardingSteps: i?.onboardingSteps ?? ALL_STEPS,
});

const slugOf = (name: string) =>
  name
    .toLowerCase()
    .replace(/&/g, " ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);

const toggle = (list: string[], key: string, on: boolean) => (on ? [...list, key] : list.filter((k) => k !== key));

function IndustryDialog({ industry, onClose }: { industry: Industry | null; onClose: () => void }) {
  const [v, setV] = useState(draftOf(industry));
  const [slugTouched, setSlugTouched] = useState(Boolean(industry));
  const { busy, error, run } = useSubmit(onClose, industry ? "Industry saved" : "Industry added");
  return (
    <FormDialog
      open
      onClose={onClose}
      icon={industry ? Pencil : Plus}
      title={industry ? `Edit ${industry.name}` : "Add an industry"}
      description={industry?.organizations ? `${industry.organizations} organizations use it; they keep their current settings.` : "Offered in Create Organization while it's open."}
      submitLabel="Save"
      busy={busy}
      error={error}
      onSubmit={() =>
        void run(() =>
          saveIndustry(
            {
              name: v.name,
              slug: v.slug,
              description: v.description,
              icon: v.icon,
              sortOrder: Number(v.sortOrder || 0),
              isActive: v.isActive,
              defaultModules: v.defaultModules,
              defaultUoms: v.defaultUoms.split(/[\s,]+/).filter(Boolean),
              pricesIncludeTax: v.pricesIncludeTax,
              // Keep the checklist in its usual order.
              onboardingSteps: ALL_STEPS.filter((s) => v.onboardingSteps.includes(s)),
            },
            industry?.id,
          ),
        )
      }
    >
      <label>
        <span>NAME</span>
        <input autoFocus value={v.name} maxLength={80} onChange={(e) => setV({ ...v, name: e.target.value, slug: slugTouched ? v.slug : slugOf(e.target.value) })} />
      </label>
      <label>
        <span>SLUG</span>
        <input value={v.slug} maxLength={60} onChange={(e) => {
            setSlugTouched(true);
            setV({ ...v, slug: e.target.value });
          }} />
      </label>
      <label className="span-two">
        <span>DESCRIPTION</span>
        <input value={v.description} maxLength={300} onChange={(e) => setV({ ...v, description: e.target.value })} />
      </label>
      <label>
        <span>ICON</span>
        <select value={v.icon} onChange={(e) => setV({ ...v, icon: e.target.value })}>
          {ICON_NAMES.map((n) => (
            <option key={n} value={n}>{n}</option>
          ))}
        </select>
      </label>
      <label>
        <span>ORDER IN LISTS</span>
        <input inputMode="numeric" value={v.sortOrder} onChange={(e) => setV({ ...v, sortOrder: e.target.value })} />
      </label>
      <label className="span-two">
        <span>UNITS (COMMA-SEPARATED)</span>
        <input value={v.defaultUoms} placeholder="pcs, box, kg" onChange={(e) => setV({ ...v, defaultUoms: e.target.value })} />
        <small>The units new organizations start with in the product dialog.</small>
      </label>
      <div className="span-two">
        <span className="field-label">DEFAULTS</span>
        <label className="check-field">
          <input type="checkbox" checked={v.isActive} onChange={(e) => setV({ ...v, isActive: e.target.checked })} />
          <div>
            <strong>Open for new organizations</strong>
            <small>Closed industries keep their organizations but can&apos;t be picked by new ones.</small>
          </div>
        </label>
        <label className="check-field">
          <input type="checkbox" checked={v.pricesIncludeTax} onChange={(e) => setV({ ...v, pricesIncludeTax: e.target.checked })} />
          <div>
            <strong>Prices include tax</strong>
            <small>The starting tax setting for new organizations.</small>
          </div>
        </label>
        {MODULES.map((m) => (
          <label key={m.key} className="check-field">
            <input type="checkbox" checked={v.defaultModules.includes(m.key)} onChange={(e) => setV({ ...v, defaultModules: toggle(v.defaultModules, m.key, e.target.checked) })} />
            <div>
              <strong>{m.label}</strong>
              <small>Switched on for new organizations (their plan must allow it).</small>
            </div>
          </label>
        ))}
      </div>
      <div className="span-two">
        <span className="field-label">SETUP CHECKLIST</span>
        <div className="step-checks">
          {ONBOARDING_STEPS.map((s) => (
            <label key={s.key} className="check-inline">
              <input type="checkbox" checked={v.onboardingSteps.includes(s.key)} onChange={(e) => setV({ ...v, onboardingSteps: toggle(v.onboardingSteps, s.key, e.target.checked) })} />
              {s.label}
            </label>
          ))}
        </div>
      </div>
    </FormDialog>
  );
}

/** /admin/industries: every industry with its organizations, catalog size and defaults. */
export function IndustryManager({ industries }: { industries: Industry[] }) {
  const [editing, setEditing] = useState<{ industry: Industry | null } | null>(null);
  const [pending, startTransition] = useTransition();

  const remove = (i: Industry) =>
    startTransition(async () => {
      const result = await deleteIndustry(i.id);
      if (result.status === "error") notify.error("Not deleted", result.message);
      else notify.success("Industry deleted");
    });

  return (
    <section className="card settings-card">
      <div className="settings-card-head">
        <span className="header-icon blue"><Building2 size={18} /></span>
        <div>
          <h2>{industries.length} industries</h2>
          <p>{industries.filter((i) => i.isActive).length} open for new organizations.</p>
        </div>
        <button type="button" className="button button-primary" onClick={() => setEditing({ industry: null })}>
          <Plus size={14} /> Industry
        </button>
      </div>
      <div className="table-wrap">
        <table className="admin-table">
          <thead>
            <tr>
              <th>INDUSTRY</th>
              <th className="numeric">ORGANIZATIONS</th>
              <th className="numeric">CATEGORIES</th>
              <th>DEFAULTS</th>
              <th><span className="sr-only">Actions</span></th>
            </tr>
          </thead>
          <tbody>
            {industries.map((i) => {
              const Icon = iconFor(i.icon);
              const unused = i.organizations === 0 && i.categories === 0;
              return (
                <tr key={i.id} className={i.isActive ? undefined : "is-retired"}>
                  <td className="primary-cell">
                    <strong>
                      <Icon size={15} /> {i.name}
                      {!i.isActive && <span className="badge">Closed</span>}
                    </strong>
                    <span>{i.description || i.slug}</span>
                  </td>
                  <td className="numeric">{i.organizations}</td>
                  <td className="numeric">{i.categories}</td>
                  <td className="plan-limits">
                    <span>{i.defaultUoms.join(", ")} · {i.pricesIncludeTax ? "prices incl. tax" : "prices excl. tax"}</span>
                    <span>{modulesText(i.defaultModules)} · {i.onboardingSteps.length} setup steps</span>
                  </td>
                  <td>
                    <div className="row-actions admin-row-actions">
                      <Link className="button" href={`/admin/categories?industry=${i.id}`}>
                        <FolderTree size={14} /> Catalog
                      </Link>
                      <button type="button" className="icon-button" aria-label={`Edit ${i.name}`} title="Edit" onClick={() => setEditing({ industry: i })}>
                        <Pencil size={14} />
                      </button>
                      <button
                        type="button"
                        className="icon-button danger"
                        aria-label={`Delete ${i.name}`}
                        title={unused ? "Delete" : "In use: close it for new organizations instead"}
                        disabled={pending || !unused}
                        onClick={() => remove(i)}
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {editing && <IndustryDialog industry={editing.industry} onClose={() => setEditing(null)} />}
    </section>
  );
}
