import "server-only";
import type { Json } from "@/lib/types/database.types";
import { createAdminClient } from "@/lib/supabase/admin";
import { deliverEmail, type DeliveryResult, type OutgoingEmail } from "./client";
import type { EmailContent } from "./templates/layout";

export type EmailTemplate =
  | "welcome"
  | "superadmin_invite"
  | "password_reset"
  | "staff_invite"
  | "document_share"
  | "payment_receipt"
  | "subscription_invoice"
  | "subscription_reminder"
  | "subscription_receipt"
  | "subscription_notice"
  | "superadmin_notice";

/** Per shop, so a mistake (or abuse) can't burn through the Resend quota. Platform settings can change it. */
const HOURLY_LIMIT_PER_SHOP = 100;

/** Sender name, default reply-to and the hourly limit from Platform settings (Phase 17). */
async function emailSettings(admin: ReturnType<typeof createAdminClient>) {
  const { data } = await admin.from("platform_settings").select("email_sender_name, email_reply_to, email_hourly_limit").maybeSingle();
  return {
    senderName: data?.email_sender_name ?? undefined,
    replyTo: data?.email_reply_to ?? null,
    hourlyLimit: data?.email_hourly_limit ?? HOURLY_LIMIT_PER_SHOP,
  };
}

type SendInput = {
  template: EmailTemplate;
  to: string;
  content: EmailContent;
  /** The shop it's sent for; null for platform emails (e.g. a superadmin password reset). */
  tenantId: string | null;
  /** The signed-in user who caused it, if any. */
  sentBy: string | null;
  replyTo?: string | null;
  attachments?: OutgoingEmail["attachments"];
  /** Stored with the log row, e.g. { documentId, number }. */
  metadata?: Record<string, Json>;
};

/**
 * Sends one transactional email and records it in email_logs (status sent / logged / failed).
 * Server-only on purpose: it isn't a server action, so the browser can't call it with any address
 * it likes. Callers check who may send what (see src/lib/actions/email.ts).
 */
export async function sendTransactionalEmail(input: SendInput): Promise<DeliveryResult> {
  const admin = createAdminClient();
  const settings = await emailSettings(admin);

  if (input.tenantId) {
    const since = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const { count } = await admin
      .from("email_logs")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", input.tenantId)
      .gte("created_at", since);
    if ((count ?? 0) >= settings.hourlyLimit) {
      return { status: "failed", error: `This shop has sent ${settings.hourlyLimit} emails in the last hour. Try again later.` };
    }
  }

  const result = await deliverEmail({
    to: input.to,
    subject: input.content.subject,
    html: input.content.html,
    text: input.content.text,
    // The shop's own reply-to (document emails) wins over the platform default.
    replyTo: input.replyTo ?? settings.replyTo,
    senderName: settings.senderName,
    attachments: input.attachments,
  });

  const { error } = await admin.from("email_logs").insert({
    tenant_id: input.tenantId,
    sent_by: input.sentBy,
    recipient: input.to,
    template: input.template,
    subject: input.content.subject,
    resend_id: result.status === "sent" ? result.id : null,
    status: result.status,
    error: result.status === "failed" ? result.error : null,
    metadata: { ...input.metadata, attachments: (input.attachments ?? []).map((a) => a.filename) },
  });
  if (error) console.error("email_logs insert failed:", error);

  if (result.status === "failed") console.error(`Email "${input.template}" to ${input.to} failed:`, result.error);
  return result;
}
