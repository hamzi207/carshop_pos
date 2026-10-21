"use client";

import { useState } from "react";
import type { LucideIcon } from "lucide-react";
import { SubscriptionDialog, useSubmit, type ActionResult } from "@/components/subscription/subscription-dialog";

/** A dialog whose only field is a typed email (the confirmation). */
export function EmailDialog(p: {
  icon: LucideIcon;
  title: string;
  description: string;
  label: string;
  submitLabel: string;
  successTitle: string;
  destructive?: boolean;
  run: (email: string) => Promise<ActionResult>;
  onClose: () => void;
}) {
  const [email, setEmail] = useState("");
  const { busy, error, run } = useSubmit(p.onClose, p.successTitle);
  return (
    <SubscriptionDialog
      open
      onClose={p.onClose}
      icon={p.icon}
      title={p.title}
      description={p.description}
      submitLabel={p.submitLabel}
      destructive={p.destructive}
      busy={busy}
      error={error}
      onSubmit={() => void run(() => p.run(email))}
    >
      <label className="span-two">
        <span>{p.label}</span>
        <input type="email" value={email} autoComplete="off" onChange={(e) => setEmail(e.target.value)} />
      </label>
    </SubscriptionDialog>
  );
}
