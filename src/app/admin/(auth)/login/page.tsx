import { Suspense } from "react";
import type { Metadata } from "next";
import { LoginForm } from "@/components/auth/login-form";

export const metadata: Metadata = { title: "Sign in" };

/** The superadmin console's sign-in (Phase 17): superadmin accounts only; shop users use /login. */
export default function AdminLoginPage() {
  return (
    <section className="card auth-card">
      <span className="eyebrow">SUPERADMIN</span>
      <h1>Sign in to the console</h1>
      <p>Use your superadmin account. Next you&apos;ll enter the code from your authenticator app.</p>
      {/* LoginForm reads ?next= from the URL. */}
      <Suspense fallback={<div className="auth-form" />}>
        <LoginForm admin />
      </Suspense>
    </section>
  );
}
