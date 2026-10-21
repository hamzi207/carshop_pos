"use client";

import { useState } from "react";
import { ShieldPlus } from "lucide-react";
import { SubscriptionDialog, useSubmit } from "@/components/subscription/subscription-dialog";
import { addSuperadmin } from "@/lib/actions/admin-console";

/** /admin/team → Add Superadmin: a new account of their own, invited by email. */
export function AddSuperadminDialog({ onClose }: { onClose: () => void }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const { busy, error, run } = useSubmit(onClose, "Superadmin added");
  return (
    <SubscriptionDialog
      open
      onClose={onClose}
      icon={ShieldPlus}
      title="Add a superadmin"
      description="They get full access to every organization, user and setting. This creates a separate account for them (not a shop's) and emails a link to choose a password; they set up a two-factor app at their first sign-in."
      submitLabel="Send Invitation"
      busy={busy}
      error={error}
      onSubmit={() => void run(() => addSuperadmin(name, email))}
    >
      <label className="span-two">
        <span>FULL NAME</span>
        <input value={name} maxLength={120} autoComplete="off" onChange={(e) => setName(e.target.value)} />
      </label>
      <label className="span-two">
        <span>EMAIL</span>
        <input type="email" value={email} maxLength={200} autoComplete="off" placeholder="name+admin@gmail.com" onChange={(e) => setEmail(e.target.value)} />
      </label>
      <p className="span-two csv-help">An email that already has a shop account can&apos;t be used. For Gmail, name+admin@gmail.com is a separate address that reaches the same inbox.</p>
    </SubscriptionDialog>
  );
}
