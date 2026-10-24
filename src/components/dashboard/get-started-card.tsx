"use client";

import { useState, type CSSProperties } from "react";
import Link from "next/link";
import { ArrowRight, CheckCircle2, Loader2, Rocket } from "lucide-react";
import { dismissOnboarding } from "@/lib/actions/dashboard";
import { notify } from "@/lib/notify";
import { percentDone, stepInfo } from "@/lib/onboarding";

/**
 * RF-18.3: the organization's setup steps (from its industry), ticked off from its own data. Org admins
 * see it on the dashboard until every step is done or they dismiss it.
 */
export function GetStartedCard({ steps }: { steps: { step: string; done: boolean }[] }) {
  const [pending, setPending] = useState(false);
  const done = steps.filter((s) => s.done).length;
  const pct = percentDone(steps);

  const dismiss = async () => {
    setPending(true);
    const result = await dismissOnboarding();
    setPending(false);
    if (result.status === "error") notify.error("Not hidden", result.message);
  };

  return (
    <section className="card get-started" aria-labelledby="get-started-title">
      <div className="card-header">
        <div className="header-with-icon">
          <span className="header-icon blue"><Rocket size={18} /></span>
          <div>
            <h2 id="get-started-title">Get started</h2>
            <p>{done} of {steps.length} setup steps done. Each one ticks itself off as you go.</p>
          </div>
        </div>
        <button type="button" className="button button-ghost" onClick={() => void dismiss()} disabled={pending}>
          {pending && <Loader2 size={14} className="animate-spin" />} Dismiss
        </button>
      </div>
      <div
        className="setup-bar"
        role="progressbar"
        aria-label="Setup progress"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={pct}
        style={{ "--pct": `${pct}%` } as CSSProperties}
      />
      <ol className="get-started-steps">
        {steps.map((s) => {
          const info = stepInfo(s.step);
          const label = info?.label ?? s.step;
          return (
            <li key={s.step} className={s.done ? "is-done" : undefined}>
              {s.done || !info ? (
                <span>
                  {s.done ? <CheckCircle2 size={16} aria-hidden /> : <span className="step-dot" aria-hidden />}
                  {label}
                  {s.done && <span className="sr-only"> (done)</span>}
                </span>
              ) : (
                <Link href={info.href}>
                  <span className="step-dot" aria-hidden />
                  {label}
                  <ArrowRight size={14} aria-hidden />
                </Link>
              )}
            </li>
          );
        })}
      </ol>
    </section>
  );
}
