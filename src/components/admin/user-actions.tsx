"use client";

import { useState, useTransition } from "react";
import { Dialog } from "radix-ui";
import { Copy, KeyRound, Loader2, Mail, MoreHorizontal, X } from "lucide-react";
import { ModalSheet } from "@/components/shared/modal-sheet";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { sendPasswordReset, setTemporaryPassword, setUserRole } from "@/lib/actions/admin";
import { notify } from "@/lib/notify";

type Props = { userId: string; name: string; email: string; role: string };

/** Role picker for one user (Admin / Staff in their shop). */
export function RoleSelect({ userId, name, role }: Omit<Props, "email">) {
  const [pending, startTransition] = useTransition();
  const [value, setValue] = useState(role);
  return (
    <select
      className="admin-role-select"
      value={value}
      disabled={pending}
      aria-label={`Role for ${name}`}
      onChange={(e) => {
        const next = e.target.value as "admin" | "staff";
        const previous = value;
        setValue(next);
        startTransition(async () => {
          const result = await setUserRole(userId, next);
          if (result.status === "error") {
            setValue(previous);
            notify.error("Role not changed", result.message);
          } else notify.success("Role changed", `${name} is now ${next === "admin" ? "an admin" : "staff"} in their shop.`);
        });
      }}
    >
      <option value="admin">Admin</option>
      <option value="staff">Staff</option>
    </select>
  );
}

/** Reset password: email a one-time link, or set a temporary password shown once. */
export function UserActions({ userId, name, email }: Props) {
  const [pending, startTransition] = useTransition();
  const [password, setPassword] = useState<string | null>(null);

  const emailReset = () =>
    startTransition(async () => {
      const result = await sendPasswordReset(userId);
      if (result.status === "error") notify.error("Reset email not sent", result.message);
      else notify.success("Reset email sent", result.message);
    });

  const temporary = () =>
    startTransition(async () => {
      const result = await setTemporaryPassword(userId);
      if (result.status === "error" || !result.password) notify.error("Password not changed", result.status === "error" ? result.message : undefined);
      else setPassword(result.password);
    });

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(password ?? "");
      notify.success("Password copied", `Give it to ${name} privately.`);
    } catch {
      notify.error("Couldn't copy", "Select the password and copy it by hand.");
    }
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button type="button" className="icon-button" disabled={pending} aria-label={`Password options for ${name}`}>
            {pending ? <Loader2 size={15} className="animate-spin" /> : <MoreHorizontal size={15} />}
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-auto min-w-56">
          <DropdownMenuItem onSelect={emailReset}><Mail size={14} /> Email a password reset link</DropdownMenuItem>
          <DropdownMenuItem onSelect={temporary}><KeyRound size={14} /> Set a temporary password</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <Dialog.Root open={password !== null} onOpenChange={(open) => !open && setPassword(null)}>
        <ModalSheet className="modal modal-sm">
          <div className="modal-header">
            <div>
              <span className="header-icon blue"><KeyRound size={18} /></span>
              <div>
                <Dialog.Title asChild><h2>Temporary password</h2></Dialog.Title>
                <Dialog.Description asChild><p>{name} · {email}</p></Dialog.Description>
              </div>
            </div>
            <Dialog.Close asChild>
              <button type="button" className="icon-button" aria-label="Close"><X size={16} /></button>
            </Dialog.Close>
          </div>
          <div className="modal-body">
            <div className="temp-password mono">{password}</div>
            <p className="confirm-text">
              Shown only now and not saved anywhere. Give it to {name} privately; their old password no longer works.
            </p>
          </div>
          <div className="modal-footer">
            <button type="button" className="button" onClick={() => void copy()}><Copy size={14} /> Copy</button>
            <Dialog.Close asChild>
              <button type="button" className="button button-primary">Done</button>
            </Dialog.Close>
          </div>
        </ModalSheet>
      </Dialog.Root>
    </>
  );
}
