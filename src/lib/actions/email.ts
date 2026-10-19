"use server";

import { headers } from "next/headers";
import { z } from "zod";
import { getShopSession } from "@/lib/auth";
import { customerLink } from "@/lib/customer-link";
import { sendTransactionalEmail } from "@/lib/email/send";
import { documentShareEmail, paymentReceiptEmail } from "@/lib/email/templates/documents";
import { documentPdf } from "@/lib/pdf";
import { loadPrintable } from "@/lib/printable";
import { createClient } from "@/lib/supabase/server";

// Emails a shop user can send. The generic sender (src/lib/email/send.ts) is deliberately not a
// server action; each action here checks the session and only sends the shop's own documents.

export type EmailActionResult = { status: "sent" | "logged"; to: string } | { status: "error"; message: string };

const emailDocumentSchema = z.object({
  id: z.uuid(),
  to: z.email("Enter a valid email address.").max(200),
  /** The document itself (PDF attached) or a receipt for its latest payment. */
  kind: z.enum(["document", "receipt"]),
});

/** Emails a quotation / invoice / estimate (with its A4 PDF), or an invoice's latest payment receipt. */
export async function emailDocument(input: z.input<typeof emailDocumentSchema>): Promise<EmailActionResult> {
  const parsed = emailDocumentSchema.safeParse(input);
  if (!parsed.success) return { status: "error", message: parsed.error.issues[0]?.message ?? "Check the email address." };
  const { id, to, kind } = parsed.data;

  const session = await getShopSession();
  // RLS: only this shop's documents load.
  const doc = await loadPrintable(await createClient(), { id });
  if (!doc) return { status: "error", message: "We couldn't find that document." };

  const origin = (await headers()).get("origin") ?? process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const shareUrl = customerLink(doc, origin);
  const metadata = { documentId: doc.id, number: doc.number, section: doc.section };

  let result;
  if (kind === "receipt") {
    const payment = doc.payments.at(-1);
    if (doc.section !== "invoices" || !payment) return { status: "error", message: "This invoice has no payments to send a receipt for." };
    result = await sendTransactionalEmail({
      template: "payment_receipt",
      to,
      content: paymentReceiptEmail(doc, payment, shareUrl),
      tenantId: session.tenant.id,
      sentBy: session.userId,
      replyTo: session.tenant.email,
      metadata: { ...metadata, amount: payment.amount },
    });
  } else {
    if (doc.statusKey === "void" || doc.statusKey === "cancelled") {
      return { status: "error", message: `A ${doc.statusLabel.toLowerCase()} ${doc.title.toLowerCase()} can't be emailed.` };
    }
    const pdf = await documentPdf(doc);
    result = await sendTransactionalEmail({
      template: "document_share",
      to,
      content: documentShareEmail(doc, shareUrl),
      tenantId: session.tenant.id,
      sentBy: session.userId,
      replyTo: session.tenant.email,
      attachments: [{ filename: pdf.filename, content: pdf.buffer }],
      metadata,
    });
  }

  if (result.status === "failed") {
    return {
      status: "error",
      message: /only send testing emails|verify a domain/i.test(result.error)
        ? "Email can only go to the account owner's address until a domain is verified in Resend."
        : "We couldn't send the email. Please try again.",
    };
  }
  return { status: result.status, to };
}
