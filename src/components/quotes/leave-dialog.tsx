"use client";

import { Dialog } from "radix-ui";
import { Loader2, Save, TriangleAlert, Undo2 } from "lucide-react";

type Props = {
  open: boolean;
  /** "Invoice INV-1004" or "this new invoice". */
  what: string;
  saveLabel: string;
  pending: boolean;
  onKeepEditing: () => void;
  onDiscard: () => void;
  onSave: () => void;
};

/** Asked when leaving a document with unsaved changes (back arrow, browser back, links). */
export function LeaveDialog({ open, what, saveLabel, pending, onKeepEditing, onDiscard, onSave }: Props) {
  return (
    <Dialog.Root open={open} onOpenChange={(next) => !next && !pending && onKeepEditing()}>
      <Dialog.Portal>
        <Dialog.Overlay className="modal-backdrop">
          <Dialog.Content className="modal modal-sm" role="alertdialog">
            <div className="modal-header">
              <div>
                <span className="header-icon danger"><TriangleAlert size={18} /></span>
                <div>
                  <Dialog.Title asChild><h2>Save your changes?</h2></Dialog.Title>
                  <Dialog.Description asChild><p>You have unsaved changes on {what}.</p></Dialog.Description>
                </div>
              </div>
            </div>
            <div className="modal-body">
              <p className="confirm-text">Save them before leaving, or discard them. Discarded changes can&apos;t be recovered.</p>
            </div>
            <div className="modal-footer">
              <button type="button" className="button" disabled={pending} onClick={onKeepEditing}>Keep editing</button>
              <button type="button" className="button button-ghost danger" disabled={pending} onClick={onDiscard}>
                <Undo2 size={14} /> Discard changes
              </button>
              <button type="button" className="button button-primary" disabled={pending} onClick={onSave}>
                {pending ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} {saveLabel}
              </button>
            </div>
          </Dialog.Content>
        </Dialog.Overlay>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
