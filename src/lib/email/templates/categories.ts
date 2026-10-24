import "server-only";
import { button, facts, factsText, layout, paragraph, type EmailContent } from "./layout";

// Category requests (Phase 18, deliverable 5): an organization asks for a category; the superadmins are
// told, and the requester hears the outcome.

const PLATFORM = "ProductLogik Invoicing System";

/** To each superadmin: a new request to approve or reject. */
export function categoryRequestNotice(p: { tenantName: string; name: string; parentPath: string | null; note: string | null; requester: string; url: string }): EmailContent {
  const subject = `Category requested: ${p.name} (${p.tenantName})`;
  const rows: [string, string][] = [
    ["Organization", p.tenantName],
    ["Requested by", p.requester],
    ["Category", p.name],
    ["Suggested parent", p.parentPath ?? "Main category"],
    ...(p.note ? ([["Note", p.note]] as [string, string][]) : []),
  ];
  const intro = `${p.tenantName} asked for a new product category. Approve it for this organization only, add it to its industry's catalog, or reject it.`;
  return {
    subject,
    html: layout({
      heading: "A category request",
      preheader: subject,
      body: paragraph("Hi,") + paragraph(intro) + facts(rows) + button("Open category requests", p.url),
      footer: `You get this because you're a ${PLATFORM} superadmin.`,
    }),
    text: ["Hi,", intro, factsText(rows), `Open category requests: ${p.url}`].join("\n\n"),
  };
}

/** To the requester: approved (and where it is) or rejected (with the reason). */
export function categoryRequestResult(p: {
  fullName: string;
  name: string;
  approved: boolean;
  /** Approved: the category's full path. */
  path: string | null;
  reason: string | null;
  url: string;
}): EmailContent {
  const subject = p.approved ? `Category added: ${p.name}` : `Category request declined: ${p.name}`;
  const lines = p.approved
    ? [`The category you asked for is ready to use: ${p.path ?? p.name}.`, "It now shows in the product dialog, inventory filters and CSV import."]
    : [`Your request for the category “${p.name}” wasn't approved.`, ...(p.reason ? [`Reason: ${p.reason}`] : [])];
  return {
    subject,
    html: layout({
      heading: p.approved ? "Your category is ready" : "Category request declined",
      preheader: subject,
      body: [`Hi ${p.fullName},`, ...lines].map(paragraph).join("") + button("Open categories", p.url),
      footer: `Sent by ${PLATFORM} because you requested a category.`,
    }),
    text: [`Hi ${p.fullName},`, ...lines, `Open categories: ${p.url}`].join("\n\n"),
  };
}
