"use client";

import { useState } from "react";
import { Dialog } from "radix-ui";
import { FileText, Loader2, Mail, Receipt, X } from "lucide-react";
import { ModalSheet } from "@/components/shared/modal-sheet";
import { emailDocument } from "@/lib/actions/email";
import { notify } from "@/lib/notify";

type Kind = "document" | "receipt";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  id: string;
  /** "Quotation", "Invoice". */
  kind: string;
  number: string;
  /** The customer's saved email, prefilled. */
  customerEmail: string | null;
  /** Invoices with payments can also send a receipt for the latest one. */
  canSendReceipt: boolean;
};

/** "Email to customer": the document with its A4 PDF attached, or a receipt for the latest payment. */
export function EmailDialog({ open, onOpenChange, ...props }: Props) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <ModalSheet className="modal modal-sm">
        {open && <EmailForm {...props} onDone={() => onOpenChange(false)} />}
      </ModalSheet>
    </Dialog.Root>
  );
}

function EmailForm({ id, kind, number, customerEmail, canSendReceipt, onDone }: Omit<Props, "open" | "onOpenChange"> & { onDone: () => void }) {
  const [to, setTo] = useState(customerEmail ?? "");
  const [what, setWhat] = useState<Kind>("document");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setPending(true);
    setError(null);
    const result = await emailDocument({ id, to: to.trim(), kind: what });
    setPending(false);
    if (result.status === "error") {
      setError(result.message);
      return;
    }
    const sent = what === "receipt" ? `Payment receipt for ${number}` : `${kind} ${number}`;
    if (result.status === "logged") notify.warning("Email not sent", `Email isn't set up on this server, so ${sent.toLowerCase()} was only logged.`);
    else notify.success("Email sent", `${sent} was emailed to ${result.to}.`);
    onDone();
  };

  const choices: { key: Kind; icon: React.ReactNode; title: string; text: string }[] = [
    { key: "document", icon: <FileText size={16} />, title: kind, text: "With the A4 PDF attached and a link to view it online." },
    { key: "receipt", icon: <Receipt size={16} />, title: "Payment receipt", text: "For the latest payment, with what is still owed." },
  ];

  return (
    <form onSubmit={submit} noValidate>
      <div className="modal-header">
        <div>
          <span className="header-icon blue"><Mail size={18} /></span>
          <div>
            <Dialog.Title asChild><h2>Email to customer · {number}</h2></Dialog.Title>
            <Dialog.Description asChild>
              <p>Replies go to your shop&apos;s email address.</p>
            </Dialog.Description>
          </div>
        </div>
        <Dialog.Close asChild>
          <button type="button" className="icon-button" aria-label="Close"><X size={16} /></button>
        </Dialog.Close>
      </div>
      <div className="modal-body">
        {error && <div className="form-alert form-alert-error modal-alert" role="alert">{error}</div>}
        <div className="form-grid">
          <label className="span-two">
            <span>SEND TO</span>
            <input
              type="email"
              inputMode="email"
              autoComplete="email"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              placeholder="customer@example.com"
              maxLength={200}
              required
              autoFocus
            />
            <small>
              Changing it here doesn&apos;t update the customer&apos;s profile. To use a new address every time, edit the customer.
            </small>
          </label>
        </div>
        {canSendReceipt && (
          <div className="radio-cards" role="radiogroup" aria-label="What to send">
            {choices.map((c) => (
              <button
                key={c.key}
                type="button"
                role="radio"
                aria-checked={what === c.key}
                className={what === c.key ? "selected" : undefined}
                onClick={() => setWhat(c.key)}
              >
                <span className="radio-dot" aria-hidden />
                <span className="choice-icon vehicle">{c.icon}</span>
                <strong>{c.title}</strong>
                <p>{c.text}</p>
              </button>
            ))}
          </div>
        )}
      </div>
      <div className="modal-footer">
        <Dialog.Close asChild>
          <button type="button" className="button" disabled={pending}>Cancel</button>
        </Dialog.Close>
        <button type="submit" className="button button-primary" disabled={pending || !to.trim()}>
          {pending ? <Loader2 size={14} className="animate-spin" /> : <Mail size={14} />} Send Email
        </button>
      </div>
    </form>
  );
}
