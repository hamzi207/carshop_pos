import "server-only";
import { headers } from "next/headers";

// One-time account links in emails (superadmin password resets, team invitations).

/** This app's origin for links in emails: the request's, else NEXT_PUBLIC_APP_URL. */
export async function appOrigin() {
  return (await headers()).get("origin") ?? process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
}

/**
 * A one-time sign-in link that lands on "Choose a password" (/reset-password). Built from the
 * hashed token rather than Supabase's own link so it goes through our /auth/confirm route
 * (server-side verifyOtp) and needs no redirect allow-list. Valid for the project's email-link
 * expiry (1 hour by default).
 */
export function passwordLink(origin: string, hashedToken: string, type: "recovery" | "invite") {
  const q = new URLSearchParams({ token_hash: hashedToken, type, next: "/reset-password" });
  return `${origin}/auth/confirm?${q}`;
}

/** Resend's sandbox only delivers to the account owner until a sending domain is verified. */
export function isResendSandboxError(error: string) {
  return /only send testing emails|verify a domain/i.test(error);
}
