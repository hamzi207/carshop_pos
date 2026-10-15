"use client";

import { useState } from "react";
import { Dialog } from "radix-ui";
import { TriangleAlert, Undo2 } from "lucide-react";
import { notify } from "@/lib/notify";

type Options = {
  /** The dialog's own open setter. */
  onOpenChange: (open: boolean) => void;
  /** Toast line after discarding, e.g. "Bilal Motors was left as it was." */
  discardedNote: string;
};

/**
 * For form pop-ups: closing with unsaved edits (Cancel, X, Escape, clicking
 * outside) asks first; discarding closes and shows a toast. The form reports
 * its dirty state with `setDirty`; pass `requestOpenChange` to the Dialog.
 */
export function useDiscardGuard({ onOpenChange, discardedNote }: Options) {
  const [dirty, setDirty] = useState(false);
  const [asking, setAsking] = useState(false);

  const close = () => {
    setDirty(false);
    onOpenChange(false);
  };
  const requestOpenChange = (open: boolean) => {
    if (open) onOpenChange(true);
    else if (dirty) setAsking(true);
    else close();
  };

  const prompt = (
    <Dialog.Root open={asking} onOpenChange={(next) => !next && setAsking(false)}>
      <Dialog.Portal>
        <Dialog.Overlay className="modal-backdrop">
          <Dialog.Content className="modal modal-sm" role="alertdialog">
            <div className="modal-header">
              <div>
                <span className="header-icon danger"><TriangleAlert size={18} /></span>
                <div>
                  <Dialog.Title asChild><h2>Discard changes?</h2></Dialog.Title>
                  <Dialog.Description asChild><p>You have unsaved changes in this form.</p></Dialog.Description>
                </div>
              </div>
            </div>
            <div className="modal-body">
              <p className="confirm-text">If you close it now, what you typed is lost. Discarded changes can&apos;t be recovered.</p>
            </div>
            <div className="modal-footer">
              <button type="button" className="button" onClick={() => setAsking(false)}>Keep editing</button>
              <button
                type="button"
                className="button button-danger"
                onClick={() => {
                  setAsking(false);
                  close();
                  notify.info("Changes discarded", discardedNote);
                }}
              >
                <Undo2 size={14} /> Discard changes
              </button>
            </div>
          </Dialog.Content>
        </Dialog.Overlay>
      </Dialog.Portal>
    </Dialog.Root>
  );

  return { requestOpenChange, setDirty, close, prompt };
}
