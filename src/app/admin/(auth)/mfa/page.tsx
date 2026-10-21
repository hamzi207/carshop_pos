import { Suspense } from "react";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { MfaForm } from "@/components/auth/mfa-form";
import { getSuperadminSession } from "@/lib/superadmin";

export const metadata: Metadata = { title: "Two-factor sign-in" };

type Props = { searchParams: Promise<{ next?: string }> };

/** /admin/mfa: superadmins pass two-factor sign-in (RF-17.1) before the console; the proxy and requireSuperadmin send them here. */
export default function MfaPage({ searchParams }: Props) {
  return (
    <section className="card auth-card">
      <span className="eyebrow">SUPERADMIN</span>
      <h1>Two-factor sign-in</h1>
      <p>The admin console needs a code from your authenticator app as well as your password.</p>
      <Suspense fallback={<div className="auth-form" />}>
        <MfaStep searchParams={searchParams} />
      </Suspense>
    </section>
  );
}

async function MfaStep({ searchParams }: Props) {
  const session = await getSuperadminSession();
  if (!session) redirect("/admin/login");
  const { next } = await searchParams;
  // Only same-site /admin paths: never an open redirect.
  const target = next && /^\/admin(\/|$|\?)/.test(next) ? next : "/admin";
  if (session.aal2) redirect(target);
  return <MfaForm next={target} />;
}
