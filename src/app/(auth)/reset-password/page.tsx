import type { Metadata } from "next";
import { ResetPasswordForm } from "@/components/auth/reset-password-form";

export const metadata: Metadata = { title: "Choose a password" };

/** Reached from a one-time email link (/auth/confirm signs the user in first). */
export default function ResetPasswordPage() {
  return (
    <section className="card auth-card">
      <span className="eyebrow">ACCOUNT</span>
      <h1>Choose a password</h1>
      <p>You&apos;ll use it with your email address to sign in.</p>
      <ResetPasswordForm />
    </section>
  );
}
