"use client";

import type { ReactNode } from "react";
import { Dialog } from "radix-ui";
import { useKeyboardInset } from "@/lib/hooks/use-keyboard-inset";

function KeyboardInset() {
  useKeyboardInset();
  return null;
}

/**
 * Portal + overlay + content for the app's form dialogs: a centred `.modal` on desktop,
 * a bottom sheet on phones (Phase 11): 16px top corners, drag handle, at most 90% of the
 * screen, the body scrolls and the footer's buttons stay above the keyboard.
 * Put it inside a Dialog.Root; children are the header / body / footer (or a form around them).
 */
export function ModalSheet({ className = "modal", children }: { className?: string; children: ReactNode }) {
  return (
    <Dialog.Portal>
      <Dialog.Overlay className="modal-backdrop modal-sheet-host">
        <Dialog.Content className={`${className} modal-sheet`}>
          <KeyboardInset />
          <span className="sheet-handle modal-handle" aria-hidden />
          {children}
        </Dialog.Content>
      </Dialog.Overlay>
    </Dialog.Portal>
  );
}
