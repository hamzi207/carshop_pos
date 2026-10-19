import "server-only";

/** What every template returns: the subject plus an HTML and a plain-text body. */
export type EmailContent = { subject: string; html: string; text: string };

// Email clients ignore stylesheets, so everything is inline. Brand: near-black with the logo red for buttons.
const INK = "#18181b";
const MUTED = "#71717a";
const LINE = "#e4e4e7";
const RED = "#d9161f";

export function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

/** A paragraph of plain text (line breaks kept). */
export function paragraph(text: string) {
  return `<p style="margin:0 0 14px;color:${INK};font-size:15px;line-height:1.55">${escapeHtml(text).replace(/\n/g, "<br>")}</p>`;
}

export function muted(text: string) {
  return `<p style="margin:0 0 14px;color:${MUTED};font-size:13px;line-height:1.5">${escapeHtml(text).replace(/\n/g, "<br>")}</p>`;
}

export function button(label: string, href: string) {
  return `<p style="margin:22px 0"><a href="${escapeHtml(href)}" style="display:inline-block;background:${RED};color:#ffffff;text-decoration:none;font-weight:600;font-size:15px;padding:12px 22px;border-radius:8px">${escapeHtml(label)}</a></p>`;
}

/** Label / value rows, e.g. invoice number, total, balance. */
export function facts(rows: [label: string, value: string][]) {
  const cells = rows
    .map(
      ([label, value]) =>
        `<tr><td style="padding:8px 0;color:${MUTED};font-size:14px;border-bottom:1px solid ${LINE}">${escapeHtml(label)}</td>` +
        `<td style="padding:8px 0;color:${INK};font-size:14px;font-weight:600;text-align:right;border-bottom:1px solid ${LINE}">${escapeHtml(value)}</td></tr>`,
    )
    .join("");
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:6px 0 18px;border-collapse:collapse">${cells}</table>`;
}

export const factsText = (rows: [string, string][]) => rows.map(([l, v]) => `${l}: ${v}`).join("\n");

/**
 * The shared frame: a heading, the body, and a footer naming who sent it.
 * `preheader` is the grey preview line inboxes show next to the subject.
 */
export function layout({ heading, preheader, body, footer }: { heading: string; preheader: string; body: string; footer: string }) {
  return `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(heading)}</title></head>
<body style="margin:0;padding:0;background:#f4f4f5">
<span style="display:none;max-height:0;overflow:hidden;opacity:0">${escapeHtml(preheader)}</span>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:24px 12px">
<tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border:1px solid ${LINE};border-radius:12px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif">
<tr><td style="height:4px;background:${RED};border-radius:12px 12px 0 0;font-size:0;line-height:0">&nbsp;</td></tr>
<tr><td style="padding:28px 28px 8px">
<h1 style="margin:0 0 18px;color:${INK};font-size:21px;line-height:1.3">${escapeHtml(heading)}</h1>
${body}
</td></tr>
<tr><td style="padding:16px 28px 24px;border-top:1px solid ${LINE};color:${MUTED};font-size:12px;line-height:1.5">${escapeHtml(footer)}</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;
}
