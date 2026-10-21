"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { KeyRound, Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { FormField } from "./form-field";

type Step =
  | { kind: "loading" }
  | { kind: "enrol"; factorId: string; qr: string; secret: string }
  | { kind: "verify"; factorId: string }
  | { kind: "failed"; message: string };

async function loadStep(): Promise<Step> {
  const supabase = createClient();
  const { data, error: listError } = await supabase.auth.mfa.listFactors();
  if (listError) return { kind: "failed", message: "We couldn't load your two-factor settings. Refresh the page." };
  const verified = data.totp.find((f) => f.status === "verified");
  if (verified) return { kind: "verify", factorId: verified.id };
  // An enrolment that was started but never finished blocks a new one: remove it first.
  for (const f of data.all.filter((f) => f.factor_type === "totp" && f.status !== "verified")) {
    await supabase.auth.mfa.unenroll({ factorId: f.id });
  }
  const { data: enrolled, error: enrolError } = await supabase.auth.mfa.enroll({
    factorType: "totp",
    friendlyName: "ProductLogik POS admin",
    issuer: "ProductLogik POS",
  });
  if (enrolError || !enrolled) {
    console.error("mfa enroll failed:", enrolError);
    return { kind: "failed", message: "We couldn't start two-factor setup. Refresh the page to try again." };
  }
  return { kind: "enrol", factorId: enrolled.id, qr: enrolled.totp.qr_code, secret: enrolled.totp.secret };
}

// One load at a time: React runs the effect twice in development, and two enrolments at once
// collide ("a factor with this name already exists").
let pending: Promise<Step> | null = null;
function loadOnce() {
  pending ??= loadStep().finally(() => {
    pending = null;
  });
  return pending;
}

/**
 * Superadmin two-factor sign-in (RF-17.1). First visit: scan the QR code with an authenticator app
 * (Google Authenticator, Microsoft Authenticator, 1Password …) and enter its 6-digit code. Later
 * visits: just the code. A verified code upgrades this session to aal2, which /admin requires.
 */
export function MfaForm({ next }: { next: string }) {
  const router = useRouter();
  const [step, setStep] = useState<Step>({ kind: "loading" });
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void loadOnce().then((s) => {
      if (!cancelled) setStep(s);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (step.kind !== "enrol" && step.kind !== "verify") return;
    const clean = code.replace(/\s/g, "");
    if (!/^\d{6}$/.test(clean)) {
      setError("Enter the 6-digit code from your authenticator app.");
      return;
    }
    setBusy(true);
    setError(null);
    const { error: verifyError } = await createClient().auth.mfa.challengeAndVerify({ factorId: step.factorId, code: clean });
    if (verifyError) {
      setBusy(false);
      setCode("");
      setError("That code didn't match. Codes change every 30 seconds: enter the current one.");
      return;
    }
    router.replace(next);
    router.refresh();
  };

  if (step.kind === "loading") {
    return (
      <p className="mfa-loading">
        <Loader2 size={16} className="animate-spin" /> Loading…
      </p>
    );
  }
  if (step.kind === "failed") {
    return (
      <div className="form-alert form-alert-error" role="alert">
        {step.message}
      </div>
    );
  }

  return (
    <form className="auth-form" onSubmit={submit} noValidate>
      {step.kind === "enrol" && (
        <div className="mfa-enrol">
          <p>Scan this code with an authenticator app on your phone, then enter the 6-digit code it shows.</p>
          {/* Supabase returns the QR code as an SVG data URL. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className="mfa-qr" src={step.qr} alt="QR code for your authenticator app" width={180} height={180} />
          <p className="mfa-secret">
            Can&apos;t scan? Enter this key instead: <code>{step.secret}</code>
          </p>
        </div>
      )}
      {error && (
        <div className="form-alert form-alert-error" role="alert">
          {error}
        </div>
      )}
      <FormField
        id="code"
        label="6-DIGIT CODE"
        icon={<KeyRound size={16} />}
        placeholder="123456"
        inputMode="numeric"
        autoComplete="one-time-code"
        autoFocus
        maxLength={7}
        value={code}
        onChange={(e) => setCode(e.target.value)}
      />
      <button type="submit" className="button button-primary auth-submit" disabled={busy}>
        {busy && <Loader2 size={16} className="animate-spin" />}
        {busy ? "Checking…" : step.kind === "enrol" ? "Turn on two-factor and continue" : "Continue"}
      </button>
    </form>
  );
}
