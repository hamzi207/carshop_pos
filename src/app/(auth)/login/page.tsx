import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { LoginForm } from "@/components/auth/login-form";

export const metadata: Metadata = { title: "Sign in" };

export default function LoginPage() {
  return (
    <section className="card auth-card">
      <span className="eyebrow">WELCOME BACK</span>
      <h1>Sign in to your shop</h1>
      <p>Manage quotes, inventory and customers.</p>
      {/* LoginForm reads ?next= and ?error= from the URL. */}
      <Suspense fallback={<div className="auth-form" />}>
        <LoginForm />
      </Suspense>
      <p className="auth-switch">
        New here? <Link href="/register">Register your shop</Link>
      </p>
    </section>
  );
}
