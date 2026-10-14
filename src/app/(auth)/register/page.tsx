import type { Metadata } from "next";
import Link from "next/link";
import { RegisterForm } from "@/components/auth/register-form";

export const metadata: Metadata = { title: "Register your shop" };

export default function RegisterPage() {
  return (
    <section className="card auth-card">
      <span className="eyebrow">GET STARTED</span>
      <h1>Register your shop</h1>
      <p>Create your shop workspace. You&apos;ll be its admin.</p>
      <RegisterForm />
      <p className="auth-switch">
        Already have an account? <Link href="/login">Sign in</Link>
      </p>
    </section>
  );
}
