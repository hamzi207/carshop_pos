import "server-only";
import { formatMoney } from "@/lib/format";
import type { PrintableDocument, PrintablePayment } from "@/lib/printable";
import { button, facts, factsText, layout, muted, paragraph, type EmailContent } from "./layout";

const greeting = (doc: PrintableDocument) => `Assalam-o-Alaikum ${doc.customer.contact || doc.customer.name},`;

function shopFooter(doc: PrintableDocument) {
  return [doc.shop.name, doc.shop.address, doc.shop.phone, doc.shop.email].filter(Boolean).join(" · ");
}

/** A quotation / invoice / estimate sent to the customer: summary, the customer link, and the PDF attached. */
export function documentShareEmail(doc: PrintableDocument, shareUrl: string | null): EmailContent {
  const money = (n: number) => formatMoney(n, doc.money);
  const kind = doc.title.toLowerCase();
  const subject = `${doc.title} ${doc.number} from ${doc.shop.name}`;
  const rows: [string, string][] = [
    [doc.title, doc.number],
    ...doc.dates.map((d): [string, string] => [d.label, d.value]),
    ["Total", money(doc.totals.total)],
  ];
  if (doc.section === "invoices" && doc.paid > 0) rows.push(["Paid", money(doc.paid)]);
  if (doc.section === "invoices") rows.push(["Balance due", money(doc.balance)]);

  const intro = `Please find your ${kind} ${doc.number} from ${doc.shop.name} attached as a PDF.`;
  const thanks = doc.section === "invoices" && doc.balance <= 0 ? "Paid in full. Thank you for your business!" : "Thank you for your business.";
  return {
    subject,
    html: layout({
      heading: `${doc.title} ${doc.number}`,
      preheader: `${doc.title} ${doc.number} · ${money(doc.totals.total)} · ${doc.shop.name}`,
      body:
        paragraph(greeting(doc)) +
        paragraph(intro) +
        facts(rows) +
        (shareUrl ? button(`View ${kind} online`, shareUrl) : "") +
        paragraph(thanks) +
        (doc.shop.terms ? muted(doc.shop.terms) : ""),
      footer: shopFooter(doc),
    }),
    text: [greeting(doc), intro, factsText(rows), shareUrl ? `View online: ${shareUrl}` : null, thanks, doc.shop.terms]
      .filter(Boolean)
      .join("\n\n"),
  };
}

/** Receipt for one payment on an invoice: what was paid, how, and what is still owed. */
export function paymentReceiptEmail(doc: PrintableDocument, payment: PrintablePayment, shareUrl: string | null): EmailContent {
  const money = (n: number) => formatMoney(n, doc.money);
  const subject = `Payment received for ${doc.title} ${doc.number}, ${doc.shop.name}`;
  const rows: [string, string][] = [
    ["Amount received", money(payment.amount)],
    ["Paid on", payment.paidOn],
    ["Method", payment.method],
    ...(payment.forItems ? [["For", payment.forItems] as [string, string]] : []),
    [doc.title, doc.number],
    ["Invoice total", money(doc.totals.total)],
    ["Paid so far", money(doc.paid)],
    ["Balance due", money(doc.balance)],
  ];
  const intro = `Thank you. We received your payment of ${money(payment.amount)} for ${doc.title.toLowerCase()} ${doc.number}.`;
  const status = doc.balance <= 0 ? "This invoice is now paid in full." : `${money(doc.balance)} is still due on this invoice.`;
  return {
    subject,
    html: layout({
      heading: "Payment received",
      preheader: `${money(payment.amount)} received for ${doc.number}. ${status}`,
      body:
        paragraph(greeting(doc)) +
        paragraph(intro) +
        facts(rows) +
        paragraph(status) +
        (shareUrl ? button("View invoice online", shareUrl) : ""),
      footer: shopFooter(doc),
    }),
    text: [greeting(doc), intro, factsText(rows), status, shareUrl ? `View online: ${shareUrl}` : null].filter(Boolean).join("\n\n"),
  };
}
