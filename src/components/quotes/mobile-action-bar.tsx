"use client";

import type { ReactNode } from "react";

type Props = {
  /** "Total" or "Balance due". */
  label: string;
  amount: string;
  lineCount: number;
  /** The main action for this stage (Save / Create Invoice / Record Payment…); none on read-only documents. */
  action: { label: string; icon: ReactNode; disabled?: boolean; run: () => void } | null;
  pending: boolean;
};

/**
 * Cashier bar pinned to the bottom of the screen on phones (Phase 10): the live
 * total, the number of lines and the stage's main button, so the cashier never
 * has to scroll back up to save. Hidden above 768px (the toolbar has the buttons).
 */
export function MobileActionBar({ label, amount, lineCount, action, pending }: Props) {
  return (
    <div className="mobile-action-bar" role="region" aria-label="Document total and main action">
      <div className="mobile-action-total">
        <span>
          {label} · {lineCount} {lineCount === 1 ? "line" : "lines"}
        </span>
        <strong aria-live="polite">{amount}</strong>
      </div>
      {action && (
        <button type="button" className="button button-primary" disabled={pending || action.disabled} onClick={action.run}>
          {action.icon} {action.label}
        </button>
      )}
    </div>
  );
}
