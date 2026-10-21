"use client";

import { useState, type FormEvent, type ReactNode } from "react";
import { Dialog } from "radix-ui";
import { Loader2, Save, X, type LucideIcon } from "lucide-react";
import { ModalSheet } from "@/components/shared/modal-sheet";
import { notify } from "@/lib/notify";

// The dialog shell for subscription changes (Phase 17, deliverable 9): the console's Subscription tab
// and the organization's "I've paid" / "Request a plan change".

export type ActionResult = { status: "success"; message?: string } | { status: "error"; message: string };

type ShellProps = {
  open: boolean;
  onClose: () => void;
  icon: LucideIcon;
  title: string;
  description: string;
  submitLabel: string;
  busy: boolean;
  error: string | null;
  onSubmit: () => void;
  destructive?: boolean;
  children: ReactNode;
};

/** Header, error line, a form-grid body and Cancel / submit. */
export function SubscriptionDialog({ open, onClose, icon: Icon, title, description, submitLabel, busy, error, onSubmit, destructive, children }: ShellProps) {
  return (
    <Dialog.Root open={open} onOpenChange={(o) => !o && !busy && onClose()}>
      <ModalSheet className="modal">
        <form
          onSubmit={(e: FormEvent) => {
            e.preventDefault();
            onSubmit();
          }}
          noValidate
        >
          <div className="modal-header">
            <div>
              <span className={`header-icon ${destructive ? "danger" : "blue"}`}><Icon size={18} /></span>
              <div>
                <Dialog.Title asChild><h2>{title}</h2></Dialog.Title>
                <Dialog.Description asChild><p>{description}</p></Dialog.Description>
              </div>
            </div>
            <Dialog.Close asChild>
              <button type="button" className="icon-button" aria-label="Close" disabled={busy}><X size={16} /></button>
            </Dialog.Close>
          </div>
          <div className="modal-body">
            {error && <div className="form-alert form-alert-error modal-alert" role="alert">{error}</div>}
            <fieldset className="form-grid" disabled={busy}>{children}</fieldset>
          </div>
          <div className="modal-footer">
            <Dialog.Close asChild>
              <button type="button" className="button" disabled={busy}>Cancel</button>
            </Dialog.Close>
            <button type="submit" className={`button ${destructive ? "button-danger" : "button-primary"}`} disabled={busy}>
              {busy ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} {submitLabel}
            </button>
          </div>
        </form>
      </ModalSheet>
    </Dialog.Root>
  );
}

/** Runs an action: busy while it runs, the error inline, a toast and close on success. */
export function useSubmit(onClose: () => void, successTitle: string) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const run = async (action: () => Promise<ActionResult>) => {
    setBusy(true);
    setError(null);
    const result = await action();
    setBusy(false);
    if (result.status === "error") {
      setError(result.message);
      return;
    }
    notify.success(successTitle, result.message);
    onClose();
  };
  return { busy, error, setError, run };
}
