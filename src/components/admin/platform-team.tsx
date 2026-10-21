"use client";

import { useState } from "react";
import { KeyRound, MoreHorizontal, ShieldCheck, ShieldOff, ShieldPlus } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { removeSuperadmin, resetTwoFactor } from "@/lib/actions/admin-console";
import type { SuperadminRow } from "@/lib/admin-data";
import { AddSuperadminDialog } from "./add-superadmin-dialog";
import { EmailDialog } from "./email-confirm-dialog";
import { adminDate } from "./format";

type Dialog = { kind: "add" } | { kind: "revoke" | "mfa"; row: SuperadminRow } | null;

/** /admin/team: who has superadmin access, add / remove them, reset a lost two-factor app. */
export function PlatformTeam({ rows, meId }: { rows: SuperadminRow[]; meId: string }) {
  const [dialog, setDialog] = useState<Dialog>(null);
  const close = () => setDialog(null);
  return (
    <section className="card customer-card">
      <div className="card-header">
        <div>
          <h2><ShieldCheck size={16} /> Superadmins</h2>
          <p>{rows.length} with full access to every organization. Their own accounts (not a shop&apos;s), signed in at /admin/login with a two-factor app.</p>
        </div>
        <button type="button" className="button button-primary" onClick={() => setDialog({ kind: "add" })}>
          <ShieldPlus size={14} /> Add Superadmin
        </button>
      </div>
      <div className="table-wrap">
        <table className="admin-table">
          <thead>
            <tr>
              <th>NAME</th>
              <th>TWO-FACTOR</th>
              <th>LAST SIGN-IN</th>
              <th><span className="sr-only">Actions</span></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td className="primary-cell">
                  <strong>{r.fullName}{r.id === meId && <em className="team-you">You</em>}</strong>
                  <span>{r.email}</span>
                </td>
                <td>{r.factors ? <span className="badge badge-green">Set up</span> : <span className="badge badge-amber">At next sign-in</span>}</td>
                <td>{adminDate(r.lastSignInAt)}</td>
                <td>
                  {r.id !== meId && (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <button type="button" className="icon-button" aria-label={`Options for ${r.fullName}`}><MoreHorizontal size={15} /></button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-auto min-w-52">
                        <DropdownMenuItem onSelect={() => setDialog({ kind: "mfa", row: r })}><KeyRound size={14} /> Reset two-factor</DropdownMenuItem>
                        <DropdownMenuItem variant="destructive" onSelect={() => setDialog({ kind: "revoke", row: r })}><ShieldOff size={14} /> Remove superadmin</DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {dialog?.kind === "add" && <AddSuperadminDialog onClose={close} />}
      {dialog?.kind === "revoke" && (
        <EmailDialog
          icon={ShieldOff}
          destructive
          title={`Remove ${dialog.row.fullName}?`}
          description="They lose console access at once, are signed out and can't sign in again. Their name stays on the audit log. The last superadmin can't be removed."
          label={`TYPE ${dialog.row.email.toUpperCase()} TO CONFIRM`}
          submitLabel="Remove Access"
          successTitle="Superadmin removed"
          run={(email) => removeSuperadmin(dialog.row.id, email)}
          onClose={close}
        />
      )}
      {dialog?.kind === "mfa" && (
        <EmailDialog
          icon={KeyRound}
          destructive
          title={`Reset two-factor for ${dialog.row.fullName}?`}
          description="For a lost phone: their two-factor app is removed and they're signed out. They set up a new one at their next sign-in, so make sure it's really them."
          label={`TYPE ${dialog.row.email.toUpperCase()} TO CONFIRM`}
          submitLabel="Reset Two-Factor"
          successTitle="Two-factor reset"
          run={(email) => resetTwoFactor(dialog.row.id, email)}
          onClose={close}
        />
      )}
    </section>
  );
}
