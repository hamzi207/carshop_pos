"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { CircleCheck, Download, Image as ImageIcon, Play, XCircle } from "lucide-react";
import {
  rejectSubscriptionPayment,
  runSubscriptionCycleNow,
  subscriptionProofUrl,
  verifySubscriptionPayment,
  type SubscriptionActionResult,
} from "@/lib/actions/subscriptions";
import type { BillingOverview, BillingRow } from "@/lib/billing-data";
import { notify } from "@/lib/notify";
import { CYCLE_LABEL, billingDate, methodLabel, pkr } from "@/lib/subscription";
import { adminDateTime } from "./format";
import { ReasonDialog } from "./subscription-dialogs";

function RowList({ title, hint, dateLabel, rows }: { title: string; hint: string; dateLabel: string; rows: BillingRow[] }) {
  return (
    <section className="card admin-section">
      <div className="card-header">
        <div>
          <h2>{title} <span className="badge badge-muted">{rows.length}</span></h2>
          <p>{hint}</p>
        </div>
      </div>
      {rows.length === 0 ? (
        <div className="empty-state">None.</div>
      ) : (
        <div className="table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>ORGANIZATION</th>
                <th>{dateLabel}</th>
                <th className="numeric">OWED</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.tenantId}>
                  <td className="primary-cell">
                    <strong><Link className="row-link" href={`/admin/tenants/${r.tenantId}/subscription`}>{r.tenantName}</Link></strong>
                    <span>{r.planName} · {CYCLE_LABEL[r.cycle]}</span>
                  </td>
                  <td>{billingDate(r.date)}</td>
                  <td className="numeric">{r.owed > 0 ? pkr(r.owed) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

/** /admin/billing: payments to verify, who is due / past due / suspended / ending a trial, and the run. */
export function BillingOverviewPanel({ data }: { data: BillingOverview }) {
  const [pending, startTransition] = useTransition();
  const [rejecting, setRejecting] = useState<string | null>(null);

  const act = (title: string, action: () => Promise<SubscriptionActionResult>) =>
    startTransition(async () => {
      const result = await action();
      if (result.status === "error") notify.error(`${title} failed`, result.message);
      else notify.success(title, result.message);
    });

  const viewProof = (id: string) =>
    startTransition(async () => {
      const r = await subscriptionProofUrl(id);
      if ("error" in r) notify.error("No screenshot", r.error);
      else window.open(r.url, "_blank", "noopener");
    });

  return (
    <>
      <div className="billing-toolbar">
        <a className="button" href="/api/admin/billing/export?kind=invoices"><Download size={14} /> Invoices CSV</a>
        <a className="button" href="/api/admin/billing/export?kind=payments"><Download size={14} /> Payments CSV</a>
        <button type="button" className="button button-primary" disabled={pending} onClick={() => act("Daily run", runSubscriptionCycleNow)}>
          <Play size={14} /> Run Today&apos;s Billing
        </button>
      </div>

      <section className="card admin-section">
        <div className="card-header">
          <div>
            <h2>Payments to verify <span className={`badge ${data.pending.length ? "badge-amber" : "badge-muted"}`}>{data.pending.length}</span></h2>
            <p>Reported by organizations. Check each against the wallet or bank statement.</p>
          </div>
        </div>
        {data.pending.length === 0 ? (
          <div className="empty-state">Nothing to verify.</div>
        ) : (
          <div className="table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>ORGANIZATION</th>
                  <th>METHOD · TRANSACTION ID</th>
                  <th>PAID ON</th>
                  <th className="numeric">AMOUNT</th>
                  <th><span className="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody>
                {data.pending.map((p) => (
                  <tr key={p.id}>
                    <td className="primary-cell">
                      <strong><Link className="row-link" href={`/admin/tenants/${p.tenantId}/subscription`}>{p.tenantName}</Link></strong>
                      <span>{p.invoiceNumber} · reported {adminDateTime(p.createdAt)}</span>
                    </td>
                    <td className="primary-cell">
                      <strong>{methodLabel(p.method)}{p.reference ? ` · ${p.reference}` : ""}</strong>
                      <span>{p.payerName ?? ""}</span>
                    </td>
                    <td>{billingDate(p.paidOn)}</td>
                    <td className="numeric">{pkr(p.amount)}</td>
                    <td>
                      <div className="row-actions admin-row-actions">
                        {p.hasProof && (
                          <button type="button" className="icon-button" disabled={pending} aria-label="View screenshot" onClick={() => viewProof(p.id)}>
                            <ImageIcon size={14} />
                          </button>
                        )}
                        <button type="button" className="button button-sm button-success" disabled={pending} onClick={() => act("Payment verified", () => verifySubscriptionPayment(p.id))}>
                          <CircleCheck size={13} /> Verify
                        </button>
                        <button type="button" className="button button-sm" disabled={pending} onClick={() => setRejecting(p.id)}>
                          <XCircle size={13} /> Reject
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <div className="admin-grid billing-grid">
        <RowList title="Past due" hint="Due date passed, in the grace days" dateLabel="DUE" rows={data.pastDue} />
        <RowList title="Suspended for non-payment" hint="Paused until paid or extended" dateLabel="SINCE" rows={data.suspended} />
        <RowList title="Due this week" hint="Invoice issued, due within 7 days" dateLabel="DUE" rows={data.dueThisWeek} />
        <RowList title="Trials ending" hint="Within 7 days" dateLabel="TRIAL ENDS" rows={data.trialsEnding} />
      </div>

      <section className="card admin-section">
        <div className="card-header">
          <div>
            <h2>Revenue per plan</h2>
            <p>Expected per month from paying subscriptions (yearly ÷ 12)</p>
          </div>
        </div>
        {data.perPlan.length === 0 ? (
          <div className="empty-state">No paying subscriptions yet.</div>
        ) : (
          <div className="table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>PLAN</th>
                  <th className="numeric">ORGANIZATIONS</th>
                  <th className="numeric">PER MONTH</th>
                </tr>
              </thead>
              <tbody>
                {data.perPlan.map((p) => (
                  <tr key={p.plan}>
                    <td><strong>{p.plan}</strong></td>
                    <td className="numeric">{p.organizations}</td>
                    <td className="numeric">{pkr(p.mrr)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {rejecting && (
        <ReasonDialog
          icon={XCircle}
          title="Reject payment"
          description="The organization's admin is emailed this reason and can report the payment again."
          submitLabel="Reject"
          successTitle="Payment rejected"
          reasonLabel="REASON (THE ORGANIZATION SEES IT)"
          destructive
          run={(r) => rejectSubscriptionPayment(rejecting, r)}
          onClose={() => setRejecting(null)}
        />
      )}
    </>
  );
}
