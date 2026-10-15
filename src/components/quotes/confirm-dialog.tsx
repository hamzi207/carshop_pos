"use client";

import type { ReactNode } from "react";
import { Dialog } from "radix-ui";
import { Loader2 } from "lucide-react";

export type ConfirmRequest = {
  title: string;
  body: ReactNode;
  confirmLabel: string;
  icon: ReactNode;
  tone?: "primary" | "danger";
  onConfirm: () => Promise<void> | void;
};

type Props = {
  request: ConfirmRequest | null;
  pending: boolean;
  onOpenChange: (open: boolean) => void;
};

/** One confirmation at a time: conversions, cancelling, deleting. */
export function ConfirmDialog({ request, pending, onOpenChange }: Props) {
  return (
    <Dialog.Root open={request !== null} onOpenChange={(open) => !pending && onOpenChange(open)}>
      <Dialog.Portal>
        <Dialog.Overlay className="modal-backdrop">
          <Dialog.Content className="modal modal-sm" role="alertdialog">
            <div className="modal-header">
              <div>
                <span className={`header-icon ${request?.tone === "danger" ? "danger" : "blue"}`}>{request?.icon}</span>
                <div>
                  <Dialog.Title asChild><h2>{request?.title}</h2></Dialog.Title>
                  <Dialog.Description asChild><p>Please confirm.</p></Dialog.Description>
                </div>
              </div>
            </div>
            <div className="modal-body">
              <div className="confirm-text">{request?.body}</div>
            </div>
            <div className="modal-footer">
              <Dialog.Close asChild>
                <button type="button" className="button" disabled={pending}>Go back</button>
              </Dialog.Close>
              <button
                type="button"
                className={`button ${request?.tone === "danger" ? "button-danger" : "button-primary"}`}
                disabled={pending}
                onClick={() => void request?.onConfirm()}
              >
                {pending && <Loader2 size={14} className="animate-spin" />}
                {request?.confirmLabel}
              </button>
            </div>
          </Dialog.Content>
        </Dialog.Overlay>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
