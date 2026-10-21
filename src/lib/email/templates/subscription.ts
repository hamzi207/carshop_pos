import "server-only";
import { billingDate, methodLabel, payToLines, pkr, type PayTo } from "@/lib/subscription";
import { button, escapeHtml, facts, factsText, layout, muted, paragraph, type EmailContent } from "./layout";

// Subscription emails (Phase 17, deliverable 9): what ProductLogik bills the organization, sent to
// its owner admin; and the superadmin's notices (a payment to verify, a plan change request).

const PLATFORM = "ProductLogik POS";

function payToBlock(payTo: PayTo, reference: string) {
  const lines = payToLines(payTo);
  if (lines.length === 0) return { html: "", text: "" };
  const intro = `Pay by mobile wallet or bank transfer and use ${reference} as the payment reference:`;
  return {
    html:
      paragraph(intro) +
      `<ul style="margin:0 0 14px;padding-left:20px;font-size:14px;line-height:1.6">${lines.map((l) => `<li>${escapeHtml(l)}</li>`).join("")}</ul>` +
      (payTo.note ? muted(payTo.note) : ""),
    text: [intro, ...lines.map((l) => `- ${l}`), payTo.note ?? ""].filter(Boolean).join("\n"),
  };
}

type Invoice = { number: string; planName: string; periodStart: string; periodEnd: string; dueDate: string; total: number; amountPaid: number };

function build(p: {
  subject: string;
  heading: string;
  preheader: string;
  greeting: string;
  lines: string[];
  rows?: [string, string][];
  extra?: { html: string; text: string };
  action?: [label: string, href: string];
  footer: string;
}): EmailContent {
  return {
    subject: p.subject,
    html: layout({
      heading: p.heading,
      preheader: p.preheader,
      body:
        [p.greeting, ...p.lines].map(paragraph).join("") +
        (p.rows ? facts(p.rows) : "") +
        (p.extra?.html ?? "") +
        (p.action ? button(p.action[0], p.action[1]) : ""),
      footer: p.footer,
    }),
    text: [p.greeting, ...p.lines, p.rows ? factsText(p.rows) : "", p.extra?.text ?? "", p.action ? `${p.action[0]}: ${p.action[1]}` : ""]
      .filter(Boolean)
      .join("\n\n"),
  };
}

const invoiceRows = (i: Invoice): [string, string][] => [
  ["Invoice", i.number],
  ["Plan", i.planName],
  ["Period", `${billingDate(i.periodStart)} to ${billingDate(i.periodEnd)}`],
  ["Amount due", pkr(i.total - i.amountPaid)],
  ["Due date", billingDate(i.dueDate)],
];

const ownerFooter = `${PLATFORM} · Sent to your organization's owner admin about its subscription.`;

/** Organization → owner admin: invoice issued, reminder, past due, suspended, reactivated, ended. */
export function subscriptionNotice(p: {
  kind: "invoice_issued" | "reminder" | "overdue" | "suspended" | "reactivated" | "ended";
  fullName: string;
  tenantName: string;
  invoice: Invoice | null;
  /** Reminders: days before the due date. */
  days: number | null;
  /** Last day before suspension (past due). */
  graceEnds: string | null;
  payTo: PayTo;
  subscriptionUrl: string;
}): EmailContent {
  const greeting = `Hi ${p.fullName},`;
  const action: [string, string] = ["Open Subscription", p.subscriptionUrl];
  const pay = p.invoice ? payToBlock(p.payTo, p.invoice.number) : undefined;
  const rows = p.invoice ? invoiceRows(p.invoice) : undefined;
  const base = { greeting, action, footer: ownerFooter, rows, extra: pay };
  switch (p.kind) {
    case "invoice_issued":
      return build({
        ...base,
        subject: `Invoice ${p.invoice?.number ?? ""} from ${PLATFORM}`,
        heading: "Your subscription invoice",
        preheader: `${p.invoice ? pkr(p.invoice.total) : ""} due ${billingDate(p.invoice?.dueDate ?? null)}.`,
        lines: [`Here is the next subscription invoice for ${p.tenantName}.`],
      });
    case "reminder": {
      const when = p.days === 0 ? "today" : `in ${p.days} ${p.days === 1 ? "day" : "days"}`;
      return build({
        ...base,
        subject: `Your ${PLATFORM} subscription is due ${when}`,
        heading: `Subscription due ${when}`,
        preheader: `Invoice ${p.invoice?.number ?? ""} is due ${when}.`,
        lines: [`The subscription for ${p.tenantName} is due ${when}. Once you've paid, use “I've paid” on the Subscription page so we can confirm it.`],
      });
    }
    case "overdue":
      return build({
        ...base,
        subject: `Your ${PLATFORM} subscription is past due`,
        heading: "Subscription past due",
        preheader: "Please pay to keep using the app.",
        lines: [
          `The subscription for ${p.tenantName} is past due.` +
            (p.graceEnds ? ` Please pay by ${billingDate(p.graceEnds)} to avoid a pause in service.` : ""),
        ],
      });
    case "suspended":
      return build({
        ...base,
        subject: `${p.tenantName} is paused: subscription unpaid`,
        heading: "Your organization is paused",
        preheader: "Pay the open invoice to continue.",
        lines: [`Because the subscription wasn't paid, ${p.tenantName} is paused. Your data is safe. Once the payment is confirmed, everything works again.`],
      });
    case "reactivated":
      return build({
        ...base,
        rows: undefined,
        extra: undefined,
        subject: `${p.tenantName} is active again`,
        heading: "Welcome back",
        preheader: "Your payment is confirmed.",
        lines: [`Thank you. Your payment is confirmed and ${p.tenantName} is active again.`],
      });
    case "ended":
      return build({
        ...base,
        rows: undefined,
        extra: undefined,
        subject: `Your ${PLATFORM} subscription has ended`,
        heading: "Subscription ended",
        preheader: "Your data is kept.",
        lines: [`The subscription for ${p.tenantName} has ended, so the app is paused. Your data is kept. Contact us to start again.`],
      });
  }
}

/** Owner admin: a payment was confirmed (receipt) or a reported one was rejected. */
export function subscriptionPaymentEmail(p: {
  kind: "verified" | "rejected";
  fullName: string;
  tenantName: string;
  payment: { amount: number; paidOn: string; method: string; reference: string | null; reason: string | null };
  invoice: Invoice;
  subscriptionUrl: string;
}): EmailContent {
  const rows: [string, string][] = [
    ["Amount", pkr(p.payment.amount)],
    ["Paid on", billingDate(p.payment.paidOn)],
    ["Method", methodLabel(p.payment.method)],
    ...(p.payment.reference ? ([["Reference", p.payment.reference]] as [string, string][]) : []),
    ["Invoice", p.invoice.number],
  ];
  if (p.kind === "verified") {
    const balance = p.invoice.total - p.invoice.amountPaid;
    return build({
      subject: `Payment received: ${pkr(p.payment.amount)} for ${p.invoice.number}`,
      heading: "Payment received",
      preheader: `Thank you for paying ${pkr(p.payment.amount)}.`,
      greeting: `Hi ${p.fullName},`,
      lines: [`Thank you. We've received your payment for ${p.tenantName}. Keep this email as your receipt.`],
      rows: [...rows, ["Balance on the invoice", balance > 0 ? pkr(balance) : "Paid in full"]],
      action: ["Open Subscription", p.subscriptionUrl],
      footer: ownerFooter,
    });
  }
  return build({
    subject: `We couldn't confirm your payment for ${p.invoice.number}`,
    heading: "Payment not confirmed",
    preheader: "Please check the details and report it again.",
    greeting: `Hi ${p.fullName},`,
    lines: [
      `We couldn't confirm the payment reported for ${p.tenantName}.`,
      p.payment.reason ? `Reason: ${p.payment.reason}` : "",
      "Please check the details and report it again from the Subscription page.",
    ].filter(Boolean),
    rows,
    action: ["Open Subscription", p.subscriptionUrl],
    footer: ownerFooter,
  });
}

/** Superadmins: a payment to verify, or a plan change request. */
export function superadminSubscriptionNotice(p: {
  kind: "payment_submitted" | "plan_change_requested";
  tenantName: string;
  rows: [string, string][];
  message: string | null;
  url: string;
}): EmailContent {
  const subject =
    p.kind === "payment_submitted" ? `Payment to verify: ${p.tenantName}` : `Plan change requested: ${p.tenantName}`;
  return build({
    subject,
    heading: p.kind === "payment_submitted" ? "A payment to verify" : "A plan change request",
    preheader: subject,
    greeting: "Hi,",
    lines: [
      p.kind === "payment_submitted"
        ? `${p.tenantName} reported a subscription payment. Check it against the wallet or bank statement, then verify or reject it.`
        : `${p.tenantName} asked to change its plan.`,
      p.message ?? "",
    ].filter(Boolean),
    rows: p.rows,
    action: ["Open the console", p.url],
    footer: `${PLATFORM} · Sent to platform superadmins.`,
  });
}
