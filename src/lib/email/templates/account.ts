import "server-only";
import { button, layout, muted, paragraph, type EmailContent } from "./layout";

const PLATFORM = "CarShop POS";

/** A new shop's first email (Phase 13: shops created by a superadmin; also usable after sign-up). */
export function welcomeEmail(p: { fullName: string; shopName: string; loginUrl: string; email: string }): EmailContent {
  const subject = `Welcome to ${PLATFORM}, ${p.shopName}`;
  const lines = [
    `Hi ${p.fullName},`,
    `Your shop ${p.shopName} is ready on ${PLATFORM}. Add your parts, then send your first quotation or invoice.`,
  ];
  return {
    subject,
    html: layout({
      heading: `Welcome, ${p.shopName}`,
      preheader: "Your shop is ready. Sign in to add parts and send your first invoice.",
      body: lines.map(paragraph).join("") + button("Sign in", p.loginUrl) + muted(`Sign in with ${p.email}.`),
      footer: `${PLATFORM} · You're receiving this because a shop was created with this email address.`,
    }),
    text: [...lines, "", `Sign in: ${p.loginUrl}`, `Sign in with ${p.email}.`].join("\n\n"),
  };
}

/** Password reset; the link (from Supabase's generateLink / recovery flow) works for 1 hour. */
export function passwordResetEmail(p: { fullName: string; resetUrl: string }): EmailContent {
  const subject = `Reset your ${PLATFORM} password`;
  const lines = [`Hi ${p.fullName},`, "We received a request to reset your password. Use the button below to choose a new one."];
  const note = "This link works for 1 hour and can be used once. If you didn't ask for a reset, ignore this email: your password stays the same.";
  return {
    subject,
    html: layout({
      heading: "Reset your password",
      preheader: "Choose a new password. The link works for 1 hour.",
      body: lines.map(paragraph).join("") + button("Choose a new password", p.resetUrl) + muted(note),
      footer: `${PLATFORM} · Sent because a password reset was requested for this email address.`,
    }),
    text: [...lines, "", `Choose a new password: ${p.resetUrl}`, note].join("\n\n"),
  };
}

/** Phase 14: a shop admin invites a team member. */
export function staffInviteEmail(p: {
  inviteeName: string;
  inviterName: string;
  shopName: string;
  role: "admin" | "staff";
  inviteUrl: string;
}): EmailContent {
  const role = p.role === "admin" ? "an admin" : "a staff member";
  const subject = `${p.inviterName} invited you to ${p.shopName}`;
  const lines = [
    `Hi ${p.inviteeName},`,
    `${p.inviterName} has invited you to join ${p.shopName} on ${PLATFORM} as ${role}. Accept the invitation to set your password and sign in.`,
  ];
  const note = "If you weren't expecting this, you can ignore this email.";
  return {
    subject,
    html: layout({
      heading: `Join ${p.shopName}`,
      preheader: `${p.inviterName} invited you to ${p.shopName} on ${PLATFORM}.`,
      body: lines.map(paragraph).join("") + button("Accept invitation", p.inviteUrl) + muted(note),
      footer: `${PLATFORM} · Sent on behalf of ${p.shopName}.`,
    }),
    text: [...lines, "", `Accept invitation: ${p.inviteUrl}`, note].join("\n\n"),
  };
}

