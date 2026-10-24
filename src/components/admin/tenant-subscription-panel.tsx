"use client";

import { useState, useTransition } from "react";
import {
  Ban,
  CalendarCog,
  CalendarPlus,
  ChevronDown,
  CircleCheck,
  CirclePlus,
  CreditCard,
  FilePlus,
  Image as ImageIcon,
  Layers,
  PauseCircle,
  PlayCircle,
  SlidersHorizontal,
  Trash2,
  Undo2,
  Wallet,
  XCircle,
} from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import {
  cancelSubscription,
  changeSubscriptionPlan,
  createSubscriptionInvoiceNow,
  rejectSubscriptionPayment,
  removeSubscriptionAdjustment,
  resumeSubscription,
  reverseSubscriptionPayment,
  subscriptionProofUrl,
  verifySubscriptionPayment,
  voidSubscriptionInvoice,
  type SubscriptionActionResult,
} from "@/lib/actions/subscriptions";
import { modulesText } from "@/lib/modules";
import { notify } from "@/lib/notify";
import type { Plan } from "@/lib/plan-data";
import type { SubscriptionInvoice, TenantSubscription } from "@/lib/subscription-data";
import {
  CYCLE_LABEL,
  INVOICE_STATUS,
  PAYMENT_STATUS,
  SUBSCRIPTION_STATUS,
  badgeOf,
  billingDate,
  methodLabel,
  pkr,
  usageText,
} from "@/lib/subscription";
import { adminDateTime } from "./format";
import { PlanFormDialog, codeFrom, type PlanDraft } from "./plan-form";
import { AdjustmentDialog, ChangePlanDialog, ExtendDialog, PricingDialog, ReasonDialog, RecordPaymentDialog, StartDateDialog } from "./subscription-dialogs";

type Open =
  | { kind: "plan" }
  | { kind: "pricing" }
  | { kind: "extend" }
  | { kind: "start" }
  | { kind: "adjust" }
  | { kind: "custom" }
  | { kind: "record"; invoice: SubscriptionInvoice }
  | { kind: "reason"; props: Omit<Parameters<typeof ReasonDialog>[0], "onClose"> };

const HISTORY_LABEL: Record<string, string> = {
  plan_id: "plan",
  billing_cycle: "cycle",
  agreed_price: "agreed price",
  discount_type: "discount",
  discount_value: "discount value",
  max_users: "max users",
  max_products: "max products",
  max_stores: "max stores",
  allowed_modules: "modules",
  trial_ends_at: "trial end",
  paid_until: "paid until",
  next_due_date: "next due date",
  extended_until: "extended until",
  grace_days: "grace days",
  auto_suspend: "auto-suspend",
  pending_plan_id: "next-period plan",
  pending_billing_cycle: "next-period cycle",
  cancel_at: "cancel date",
  started_at: "start date",
  price_note: "price note",
};

/** "status, paid until" from a history row's changed fields. */
function historyText(after: unknown) {
  if (!after || typeof after !== "object") return "";
  return Object.keys(after)
    .filter((k) => !["tenant_id", "created_at"].includes(k))
    .map((k) => HISTORY_LABEL[k] ?? k.replace(/_/g, " "))
    .join(", ");
}

function LimitRow({ label, usage, override, plan }: { label: string; usage: number; override: number | null; plan: number | null }) {
  const limit = override ?? plan;
  const over = limit !== null && usage > limit;
  return (
    <div className="sub-usage-row">
      <span>{label}</span>
      <strong className={over ? "danger-text" : undefined}>{usageText(usage, limit)}</strong>
      {override !== null && <span className="badge badge-purple">Override</span>}
    </div>
  );
}

/** The organization's Subscription tab (Phase 17, deliverable 9). */
export function TenantSubscriptionPanel({ sub, plans, tenantName }: { sub: TenantSubscription; plans: Plan[]; tenantName: string }) {
  const [open, setOpen] = useState<Open | null>(null);
  const [pending, startTransition] = useTransition();
  const close = () => setOpen(null);
  const status = badgeOf(SUBSCRIPTION_STATUS, sub.status);
  const current = plans.find((p) => p.id === sub.planId);
  const billingSuspended = sub.tenantStatus === "suspended" && ["Subscription unpaid", "Subscription ended"].includes(sub.statusReason ?? "");

  const act = (title: string, action: () => Promise<SubscriptionActionResult>) =>
    startTransition(async () => {
      const result = await action();
      if (result.status === "error") notify.error(`${title} failed`, result.message);
      else notify.success(title, result.message);
    });

  const reason = (props: Omit<Parameters<typeof ReasonDialog>[0], "onClose">) => setOpen({ kind: "reason", props });

  const viewProof = (paymentId: string) =>
    startTransition(async () => {
      const r = await subscriptionProofUrl(paymentId);
      if ("error" in r) notify.error("No screenshot", r.error);
      else window.open(r.url, "_blank", "noopener");
    });

  const customDraft: PlanDraft | null = current
    ? {
        name: `${tenantName} plan`.slice(0, 60),
        code: codeFrom(`${tenantName}-plan`),
        description: `Custom plan for ${tenantName}`.slice(0, 500),
        visibility: "custom",
        priceMonthly: sub.cycle === "monthly" ? sub.price.base : current.priceMonthly,
        priceYearly: sub.cycle === "yearly" ? sub.price.base : current.priceYearly,
        maxStores: sub.overrides.maxStores ?? current.maxStores,
        maxUsers: sub.overrides.maxUsers ?? current.maxUsers,
        maxProducts: sub.overrides.maxProducts ?? current.maxProducts,
        modules: sub.overrides.modules ?? current.modules,
        trialDays: current.trialDays,
        sortOrder: 80,
      }
    : null;

  return (
    <>
      {billingSuspended && (
        <div className="form-alert form-alert-error admin-section" role="status">
          Suspended by the subscription run ({sub.statusReason}). Recording a payment that covers the invoice, extending the due date or resuming reactivates it.
        </div>
      )}

      <section className="card admin-section">
        <div className="card-header">
          <div>
            <h2>
              {sub.planName} · {CYCLE_LABEL[sub.cycle]} <span className={status.tone}>{status.label}</span>
            </h2>
            <p>
              {pkr(sub.price.net)} per {sub.cycle === "yearly" ? "year" : "month"}
              {sub.price.discount > 0 && ` (${pkr(sub.price.base)} less ${pkr(sub.price.discount)})`}
              {sub.price.fromPlan ? " · plan price" : " · agreed price"}
              {sub.priceNote && ` · ${sub.priceNote}`}
            </p>
          </div>
          <div className="row-actions admin-row-actions">
            <button type="button" className="button button-primary" disabled={pending} onClick={() => setOpen({ kind: "plan" })}>
              <Layers size={14} /> Change Plan
            </button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button type="button" className="icon-button" disabled={pending} aria-label="More subscription actions">
                  <ChevronDown size={15} />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-auto min-w-56">
                <DropdownMenuItem onSelect={() => setOpen({ kind: "pricing" })}><SlidersHorizontal size={14} /> Price &amp; limits</DropdownMenuItem>
                <DropdownMenuItem onSelect={() => setOpen({ kind: "custom" })}><CirclePlus size={14} /> Create custom plan for this organization</DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={() => act("Invoice created", () => createSubscriptionInvoiceNow(sub.tenantId))}><FilePlus size={14} /> Create invoice now</DropdownMenuItem>
                <DropdownMenuItem onSelect={() => setOpen({ kind: "adjust" })}><Wallet size={14} /> Add charge or credit</DropdownMenuItem>
                <DropdownMenuItem onSelect={() => setOpen({ kind: "extend" })} disabled={sub.status === "cancelled"}><CalendarPlus size={14} /> Extend {sub.paidUntil === null && sub.trialEndsAt ? "trial" : "due date"}</DropdownMenuItem>
                <DropdownMenuItem onSelect={() => setOpen({ kind: "start" })} disabled={sub.status === "cancelled" || sub.invoices.some((i) => i.status !== "void")}><CalendarCog size={14} /> Change start date</DropdownMenuItem>
                <DropdownMenuSeparator />
                {sub.status === "cancelled" || sub.cancelAt ? (
                  <DropdownMenuItem
                    onSelect={() =>
                      reason({
                        icon: PlayCircle,
                        title: "Resume subscription",
                        description: sub.status === "cancelled" ? "Billing starts again from today; the time it was off isn't billed." : "The cancellation is undone.",
                        submitLabel: "Resume",
                        successTitle: "Resumed",
                        run: (r) => resumeSubscription(sub.tenantId, r),
                      })
                    }
                  >
                    <PlayCircle size={14} /> Resume subscription
                  </DropdownMenuItem>
                ) : (
                  <DropdownMenuItem
                    variant="destructive"
                    onSelect={() =>
                      reason({
                        icon: PauseCircle,
                        title: "Cancel subscription",
                        description: "It stays usable until the end of the paid period (or trial), then it's suspended as “Subscription ended”. Data is kept.",
                        submitLabel: "Cancel Subscription",
                        successTitle: "Cancelled",
                        destructive: true,
                        run: (r) => cancelSubscription(sub.tenantId, r),
                      })
                    }
                  >
                    <PauseCircle size={14} /> Cancel subscription
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        <div className="sub-summary">
          <dl className="sub-facts">
            <div><dt>Started</dt><dd>{billingDate(sub.startedAt)}</dd></div>
            {sub.status === "trial" && <div><dt>Trial ends</dt><dd>{billingDate(sub.trialEndsAt)}</dd></div>}
            <div><dt>Paid until</dt><dd>{sub.paidUntil ? billingDate(sub.paidUntil) : "Nothing paid yet"}</dd></div>
            <div><dt>Next due</dt><dd>{sub.nextDueDate ? billingDate(sub.nextDueDate) : "Not billed"}</dd></div>
            {sub.extendedUntil && sub.nextDueDate === sub.extendedUntil && <div><dt>Extended until</dt><dd>{billingDate(sub.extendedUntil)}</dd></div>}
            <div><dt>Grace</dt><dd>{sub.graceDays} days · {sub.autoSuspend ? "auto-suspend on" : "auto-suspend off"}</dd></div>
            {sub.pending && (
              <div>
                <dt>Next period</dt>
                <dd>{[sub.pending.planName, sub.pending.cycle && CYCLE_LABEL[sub.pending.cycle]].filter(Boolean).join(" · ")}</dd>
              </div>
            )}
            {sub.cancelAt && <div><dt>Ends after</dt><dd>{billingDate(sub.cancelAt)}</dd></div>}
          </dl>
          <div className="sub-usage">
            <LimitRow label="Users" usage={sub.usage.users} override={sub.overrides.maxUsers} plan={sub.planLimits.maxUsers} />
            <LimitRow label="Products" usage={sub.usage.products} override={sub.overrides.maxProducts} plan={sub.planLimits.maxProducts} />
            <LimitRow label="Stores" usage={sub.usage.stores} override={sub.overrides.maxStores} plan={sub.planLimits.maxStores} />
            <div className="sub-usage-row">
              <span>Modules</span>
              <strong>{modulesText(sub.overrides.modules ?? sub.planLimits.modules)}</strong>
              {sub.overrides.modules !== null && <span className="badge badge-purple">Override</span>}
            </div>
          </div>
        </div>

        {sub.adjustments.length > 0 && (
          <div className="sub-adjustments">
            <h3>On the next invoice</h3>
            <ul>
              {sub.adjustments.map((a) => (
                <li key={a.id}>
                  <span>{a.description}</span>
                  <strong className={a.amount < 0 ? "success-text" : undefined}>{a.amount < 0 ? `−${pkr(-a.amount)}` : pkr(a.amount)}</strong>
                  <button type="button" className="icon-button" disabled={pending} aria-label={`Remove ${a.description}`} onClick={() => act("Removed", () => removeSubscriptionAdjustment(a.id))}>
                    <Trash2 size={14} />
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>

      <section className="card admin-section">
        <div className="card-header">
          <div>
            <h2>Invoices</h2>
            <p>What ProductLogik billed this organization</p>
          </div>
        </div>
        {sub.invoices.length === 0 ? (
          <div className="empty-state">No invoices yet. The daily run issues one {sub.nextDueDate ? `before ${billingDate(sub.nextDueDate)}` : "when a paid plan starts"}.</div>
        ) : (
          <div className="table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>INVOICE</th>
                  <th>PERIOD</th>
                  <th>DUE</th>
                  <th className="numeric">TOTAL</th>
                  <th className="numeric">PAID</th>
                  <th>STATUS</th>
                  <th><span className="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody>
                {sub.invoices.map((i) => {
                  const badge = badgeOf(INVOICE_STATUS, i.status);
                  const open = i.status === "unpaid" || i.status === "partly_paid";
                  return (
                    <tr key={i.id}>
                      <td className="primary-cell">
                        <strong><a className="row-link" href={`/api/subscription-invoices/${i.id}/pdf`} target="_blank" rel="noopener">{i.number}</a></strong>
                        <span>{i.planName} · {CYCLE_LABEL[i.cycle]}{i.voidReason ? ` · void: ${i.voidReason}` : ""}</span>
                      </td>
                      <td>{billingDate(i.periodStart)} – {billingDate(i.periodEnd)}</td>
                      <td>{billingDate(i.dueDate)}</td>
                      <td className="numeric">{pkr(i.total)}</td>
                      <td className="numeric">{pkr(i.amountPaid)}</td>
                      <td><span className={badge.tone}>{badge.label}</span></td>
                      <td>
                        <div className="row-actions admin-row-actions">
                          {open && (
                            <button type="button" className="button button-sm" disabled={pending} onClick={() => setOpen({ kind: "record", invoice: i })}>
                              <CreditCard size={13} /> Record Payment
                            </button>
                          )}
                          {i.status !== "void" && i.amountPaid === 0 && (
                            <button
                              type="button"
                              className="icon-button"
                              disabled={pending}
                              aria-label={`Void ${i.number}`}
                              onClick={() =>
                                reason({
                                  icon: Ban,
                                  title: `Void ${i.number}`,
                                  description: "It's kept but no longer due. Its charges and credits go back on the next invoice.",
                                  submitLabel: "Void Invoice",
                                  successTitle: "Invoice void",
                                  destructive: true,
                                  run: (r) => voidSubscriptionInvoice(i.id, r),
                                })
                              }
                            >
                              <Ban size={14} />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="card admin-section">
        <div className="card-header">
          <div>
            <h2>Payments</h2>
            <p>Recorded by ProductLogik or reported by the organization (“I&apos;ve paid”)</p>
          </div>
        </div>
        {sub.payments.length === 0 ? (
          <div className="empty-state">No payments yet.</div>
        ) : (
          <div className="table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>PAID ON</th>
                  <th>INVOICE</th>
                  <th>METHOD · REFERENCE</th>
                  <th className="numeric">AMOUNT</th>
                  <th>STATUS</th>
                  <th><span className="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody>
                {sub.payments.map((p) => {
                  const badge = badgeOf(PAYMENT_STATUS, p.status);
                  return (
                    <tr key={p.id}>
                      <td className="primary-cell">
                        <strong>{billingDate(p.paidOn)}</strong>
                        <span>{p.submittedBy ? `Reported by ${p.submittedBy}` : "Recorded by ProductLogik"} · {adminDateTime(p.createdAt)}</span>
                      </td>
                      <td>{p.invoiceNumber}</td>
                      <td className="primary-cell">
                        <strong>{methodLabel(p.method)}{p.reference ? ` · ${p.reference}` : ""}</strong>
                        <span>{[p.payerName, p.note, p.reason && `Reason: ${p.reason}`].filter(Boolean).join(" · ")}</span>
                      </td>
                      <td className="numeric">{pkr(p.amount)}</td>
                      <td><span className={badge.tone}>{badge.label}</span></td>
                      <td>
                        <div className="row-actions admin-row-actions">
                          {p.hasProof && (
                            <button type="button" className="icon-button" disabled={pending} aria-label="View screenshot" onClick={() => viewProof(p.id)}>
                              <ImageIcon size={14} />
                            </button>
                          )}
                          {p.status === "pending" && (
                            <>
                              <button type="button" className="button button-sm button-success" disabled={pending} onClick={() => act("Payment verified", () => verifySubscriptionPayment(p.id))}>
                                <CircleCheck size={13} /> Verify
                              </button>
                              <button
                                type="button"
                                className="button button-sm"
                                disabled={pending}
                                onClick={() =>
                                  reason({
                                    icon: XCircle,
                                    title: "Reject payment",
                                    description: "The organization's admin is emailed this reason and can report the payment again.",
                                    submitLabel: "Reject",
                                    successTitle: "Payment rejected",
                                    reasonLabel: "REASON (THE ORGANIZATION SEES IT)",
                                    destructive: true,
                                    run: (r) => rejectSubscriptionPayment(p.id, r),
                                  })
                                }
                              >
                                <XCircle size={13} /> Reject
                              </button>
                            </>
                          )}
                          {p.status === "verified" && (
                            <button
                              type="button"
                              className="icon-button"
                              disabled={pending}
                              aria-label="Reverse payment"
                              onClick={() =>
                                reason({
                                  icon: Undo2,
                                  title: "Reverse payment",
                                  description: "For a payment that bounced or was recorded by mistake. The invoice opens again.",
                                  submitLabel: "Reverse",
                                  successTitle: "Payment reversed",
                                  destructive: true,
                                  run: (r) => reverseSubscriptionPayment(p.id, r),
                                })
                              }
                            >
                              <Undo2 size={14} />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="card admin-section">
        <div className="card-header">
          <div>
            <h2>History</h2>
            <p>Every change to the subscription, newest first</p>
          </div>
        </div>
        {sub.history.length === 0 ? (
          <div className="empty-state">No changes yet.</div>
        ) : (
          <ul className="admin-activity">
            {sub.history.map((h) => (
              <li key={h.id}>
                <span>
                  <strong>{h.action === "created" ? "Subscription created" : `Changed ${historyText(h.after)}`}</strong>
                  {h.reason && ` · ${h.reason}`}
                  {` · ${h.by ?? "System"}`}
                </span>
                <time>{adminDateTime(h.at)}</time>
              </li>
            ))}
          </ul>
        )}
      </section>

      {open?.kind === "plan" && <ChangePlanDialog sub={sub} plans={plans} icon={Layers} onClose={close} />}
      {open?.kind === "pricing" && <PricingDialog sub={sub} icon={SlidersHorizontal} onClose={close} />}
      {open?.kind === "extend" && <ExtendDialog sub={sub} icon={CalendarPlus} onClose={close} />}
      {open?.kind === "start" && <StartDateDialog sub={sub} icon={CalendarCog} onClose={close} />}
      {open?.kind === "adjust" && <AdjustmentDialog tenantId={sub.tenantId} icon={Wallet} onClose={close} />}
      {open?.kind === "record" && <RecordPaymentDialog invoice={open.invoice} icon={CreditCard} onClose={close} />}
      {open?.kind === "reason" && <ReasonDialog {...open.props} onClose={close} />}
      <PlanFormDialog
        draft={open?.kind === "custom" ? customDraft : null}
        title={`Custom plan for ${tenantName}`}
        submitLabel="Create & Assign"
        onClose={close}
        onSaved={async (planId) => {
          const result = await changeSubscriptionPlan(sub.tenantId, {
            planId,
            cycle: sub.cycle,
            when: "now",
            startAs: "keep",
            keepPrice: false,
            reason: "Custom plan created for this organization",
          });
          if (result.status === "error") notify.warning("Plan created but not assigned", result.message);
          else notify.success("Custom plan assigned", result.message);
        }}
      />
    </>
  );
}
