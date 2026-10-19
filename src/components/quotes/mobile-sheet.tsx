"use client";

import type { ReactNode, RefObject } from "react";
import { Dialog } from "radix-ui";
import { X } from "lucide-react";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  /** Read by screen readers under the title. */
  description: string;
  /** "full": covers the screen (search). "bottom": rises from the bottom edge (editing one line). */
  variant?: "full" | "bottom";
  /** Field focused when the sheet opens (otherwise the first focusable element). */
  initialFocus?: RefObject<HTMLElement | null>;
  /** Pinned under the scrolling body (e.g. a Done button). */
  footer?: ReactNode;
  children: ReactNode;
};

/**
 * Phone sheet used by the document builder (Phase 10): full-screen part and
 * customer search, and the bottom sheet for editing a line. Built on Radix
 * Dialog, so focus is trapped and Escape / the back gesture close it.
 */
export function MobileSheet({ open, onOpenChange, title, description, variant = "full", initialFocus, footer, children }: Props) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="sheet-backdrop" />
        <Dialog.Content
          className={`sheet sheet-${variant}`}
          onOpenAutoFocus={(e) => {
            if (!initialFocus) return;
            e.preventDefault();
            initialFocus.current?.focus();
          }}
        >
          {variant === "bottom" && <span className="sheet-handle" aria-hidden />}
          <div className="sheet-header">
            <Dialog.Title asChild><h2>{title}</h2></Dialog.Title>
            <Dialog.Description className="sr-only">{description}</Dialog.Description>
            <Dialog.Close asChild>
              <button type="button" className="icon-button sheet-close" aria-label="Close">
                <X size={18} />
              </button>
            </Dialog.Close>
          </div>
          <div className="sheet-body">{children}</div>
          {footer && <div className="sheet-footer">{footer}</div>}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
