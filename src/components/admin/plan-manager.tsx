"use client";

import { useState, useTransition } from "react";
import { Archive, ChevronDown, Copy, Layers, Pencil, Plus, RotateCcw } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { setPlanRetired } from "@/lib/actions/plans";
import { modulesText } from "@/lib/modules";
import { notify } from "@/lib/notify";
import type { Plan } from "@/lib/plan-data";
import { limitText, planPriceText } from "@/lib/validations/plan.schema";
import { EMPTY_PLAN, PlanFormDialog, codeFrom, type PlanDraft } from "./plan-form";

const draftOf = (p: Plan): PlanDraft => ({
  id: p.id,
  name: p.name,
  code: p.code,
  description: p.description,
  visibility: p.visibility,
  priceMonthly: p.priceMonthly,
  priceYearly: p.priceYearly,
  maxStores: p.maxStores,
  maxUsers: p.maxUsers,
  maxProducts: p.maxProducts,
  modules: p.modules,
  trialDays: p.trialDays,
  sortOrder: p.sortOrder,
});

/** /admin/plans: every plan with its prices, limits and organizations; new, edit, duplicate, retire. */
export function PlanManager({ plans }: { plans: Plan[] }) {
  const [editing, setEditing] = useState<{ draft: PlanDraft; title: string } | null>(null);
  const [pending, startTransition] = useTransition();

  const duplicate = (p: Plan) => {
    const { id: _id, ...rest } = draftOf(p);
    void _id;
    const name = `${p.name} copy`;
    setEditing({ draft: { ...rest, name, code: codeFrom(name), visibility: "custom" }, title: `Duplicate ${p.name}` });
  };

  const retire = (p: Plan, retired: boolean) =>
    startTransition(async () => {
      const result = await setPlanRetired(p.id, retired);
      if (result.status === "error") notify.error(retired ? "Not retired" : "Not restored", result.message);
      else if (result.status === "success") notify.success(retired ? "Plan retired" : "Plan restored", result.message);
    });

  return (
    <section className="card admin-section">
      <div className="card-header">
        <div>
          <h2>Plans</h2>
          <p>{plans.filter((p) => !p.retiredAt).length} in use. Retired plans stay with the organizations already on them.</p>
        </div>
        <button type="button" className="button button-primary" onClick={() => setEditing({ draft: EMPTY_PLAN, title: "New plan" })}>
          <Plus size={14} /> New Plan
        </button>
      </div>

      {plans.length === 0 ? (
        <div className="empty-state">
          <span className="header-icon blue"><Layers size={18} /></span>
          <strong>No plans yet</strong>
        </div>
      ) : (
        <div className="table-wrap">
          <table className="admin-table plan-table">
            <thead>
              <tr>
                <th>PLAN</th>
                <th className="numeric">MONTHLY</th>
                <th className="numeric">YEARLY</th>
                <th>LIMITS</th>
                <th>TRIAL</th>
                <th className="numeric">ORGANIZATIONS</th>
                <th><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody>
              {plans.map((p) => (
                <tr key={p.id} className={p.retiredAt ? "is-retired" : undefined}>
                  <td className="primary-cell">
                    <strong>
                      {p.name}
                      {p.isDefault && <span className="badge badge-blue">Sign-up default</span>}
                      {p.visibility === "custom" && <span className="badge badge-purple">Custom</span>}
                      {p.retiredAt && <span className="badge">Retired</span>}
                    </strong>
                    <span>{p.description || p.code}</span>
                  </td>
                  <td className="numeric">{planPriceText(p.priceMonthly)}</td>
                  <td className="numeric">{planPriceText(p.priceYearly)}</td>
                  <td className="plan-limits">
                    <span>{limitText(p.maxStores)} stores · {limitText(p.maxUsers)} users</span>
                    <span>{limitText(p.maxProducts)} products · {modulesText(p.modules)}</span>
                  </td>
                  <td>{p.trialDays ? `${p.trialDays} days` : "None"}</td>
                  <td className="numeric">{p.organizations}</td>
                  <td>
                    <div className="row-actions admin-row-actions">
                      <button type="button" className="button" disabled={pending} onClick={() => setEditing({ draft: draftOf(p), title: `Edit ${p.name}` })}>
                        <Pencil size={14} /> Edit
                      </button>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <button type="button" className="icon-button" disabled={pending} aria-label={`More for ${p.name}`}>
                            <ChevronDown size={15} />
                          </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-auto min-w-44">
                          <DropdownMenuItem onSelect={() => duplicate(p)}><Copy size={14} /> Duplicate</DropdownMenuItem>
                          {p.retiredAt ? (
                            <DropdownMenuItem onSelect={() => retire(p, false)}><RotateCcw size={14} /> Restore</DropdownMenuItem>
                          ) : (
                            <DropdownMenuItem variant="destructive" onSelect={() => retire(p, true)}><Archive size={14} /> Retire</DropdownMenuItem>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <PlanFormDialog draft={editing?.draft ?? null} title={editing?.title ?? ""} onClose={() => setEditing(null)} />
    </section>
  );
}
