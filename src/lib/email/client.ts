import "server-only";
import { Resend } from "resend";

export type OutgoingEmail = {
  to: string;
  subject: string;
  html: string;
  text: string;
  /** Replies go to the shop rather than the no-reply sender. */
  replyTo?: string | null;
  attachments?: { filename: string; content: Buffer }[];
};

export type DeliveryResult =
  | { status: "sent"; id: string }
  /** No RESEND_API_KEY: printed to the server console instead (local development). */
  | { status: "logged" }
  | { status: "failed"; error: string };

/**
 * Who emails come from. Until a domain is verified in Resend, only onboarding@resend.dev works, and
 * only to the Resend account's own address; set RESEND_FROM_EMAIL (e.g. "ProductLogik POS <no-reply@yourdomain.pk>")
 * once the domain is verified.
 */
const FROM = process.env.RESEND_FROM_EMAIL || "ProductLogik POS <onboarding@resend.dev>";

let client: Resend | null = null;
function resend() {
  const key = process.env.RESEND_API_KEY;
  if (!key) return null;
  client ??= new Resend(key);
  return client;
}

/** Sends one email through Resend, or logs it to the console when there is no API key. Never throws. */
export async function deliverEmail(email: OutgoingEmail): Promise<DeliveryResult> {
  const api = resend();
  if (!api) {
    console.info(
      [
        "──── Email (not sent: RESEND_API_KEY is not set) ────",
        `To: ${email.to}`,
        `Subject: ${email.subject}`,
        ...(email.attachments?.length ? [`Attachments: ${email.attachments.map((a) => a.filename).join(", ")}`] : []),
        "",
        email.text,
        "─────────────────────────────────────────────────────",
      ].join("\n"),
    );
    return { status: "logged" };
  }

  try {
    const { data, error } = await api.emails.send({
      from: FROM,
      to: email.to,
      subject: email.subject,
      html: email.html,
      text: email.text,
      ...(email.replyTo ? { replyTo: email.replyTo } : {}),
      ...(email.attachments?.length ? { attachments: email.attachments } : {}),
    });
    if (error || !data) return { status: "failed", error: error?.message ?? "Resend returned no message id." };
    return { status: "sent", id: data.id };
  } catch (err) {
    return { status: "failed", error: err instanceof Error ? err.message : String(err) };
  }
}
