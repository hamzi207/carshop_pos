"use client";

import { useState } from "react";
import { Archive, ArchiveRestore, Ban, ShieldAlert } from "lucide-react";
import { SubscriptionDialog, useSubmit } from "@/components/subscription/subscription-dialog";
import { setTenantStatus } from "@/lib/actions/admin";
import { archiveTenant, restoreTenant } from "@/lib/actions/admin-console";

// Phase 17: suspend with a reason, archive (reason + typed name) and restore. Used by the shop's
// actions menu and the Overview tab's danger zone.

export function SuspendDialog({ tenantId, name, onClose }: { tenantId: string; name: string; onClose: () => void }) {
  const [reason, setReason] = useState("");
  const { busy, error, run } = useSubmit(onClose, `${name} is suspended`);
  return (
    <SubscriptionDialog
      open
      onClose={onClose}
      icon={Ban}
      destructive
      title={`Suspend ${name}?`}
      description="Everyone in this shop is signed out at their next click and can't sign in. Nothing is deleted, and you can activate it again at any time."
      submitLabel="Suspend Shop"
      busy={busy}
      error={error}
      onSubmit={() =>
        void run(async () => {
          const result = await setTenantStatus(tenantId, "suspended", reason);
          return result.status === "error" ? result : { status: "success", message: "Its users are signed out and see your reason when they try to sign in." };
        })
      }
    >
      <label className="span-two">
        <span>REASON SHOWN TO THEIR USERS (OPTIONAL)</span>
        <input value={reason} maxLength={300} placeholder="e.g. Account under review" onChange={(e) => setReason(e.target.value)} />
      </label>
    </SubscriptionDialog>
  );
}

export function ArchiveDialog({ tenantId, name, onClose }: { tenantId: string; name: string; onClose: () => void }) {
  const [reason, setReason] = useState("");
  const [typed, setTyped] = useState("");
  const { busy, error, run } = useSubmit(onClose, `${name} archived`);
  const matches = typed.trim().toLowerCase() === name.trim().toLowerCase();
  return (
    <SubscriptionDialog
      open
      onClose={onClose}
      icon={Archive}
      destructive
      title={`Archive ${name}?`}
      description="Its users are signed out and can't sign in, and the daily billing run skips it. All its data is kept and it can be restored at any time. Organizations are never deleted."
      submitLabel="Archive Organization"
      busy={busy}
      error={error}
      onSubmit={() => void run(() => archiveTenant(tenantId, reason, typed))}
    >
      <label className="span-two">
        <span>REASON</span>
        <input value={reason} maxLength={500} placeholder="Kept in the audit log" onChange={(e) => setReason(e.target.value)} />
      </label>
      <label className="span-two">
        <span>TYPE “{name}” TO CONFIRM</span>
        <input value={typed} autoComplete="off" onChange={(e) => setTyped(e.target.value)} aria-invalid={typed !== "" && !matches} />
      </label>
    </SubscriptionDialog>
  );
}

export function RestoreDialog({ tenantId, name, onClose }: { tenantId: string; name: string; onClose: () => void }) {
  const [reason, setReason] = useState("");
  const { busy, error, run } = useSubmit(onClose, `${name} restored`);
  return (
    <SubscriptionDialog
      open
      onClose={onClose}
      icon={ArchiveRestore}
      title={`Restore ${name}?`}
      description="Everything comes back as it was: its status, users, subscription and data. Its users can sign in again."
      submitLabel="Restore Organization"
      busy={busy}
      error={error}
      onSubmit={() => void run(() => restoreTenant(tenantId, reason))}
    >
      <label className="span-two">
        <span>REASON</span>
        <input value={reason} maxLength={500} placeholder="Kept in the audit log" onChange={(e) => setReason(e.target.value)} />
      </label>
    </SubscriptionDialog>
  );
}

/** Overview tab: archive / restore in one place, with the archive's details. */
export function TenantDangerZone({
  tenantId,
  name,
  archive,
}: {
  tenantId: string;
  name: string;
  archive: { at: string; by: string; reason: string | null } | null;
}) {
  const [open, setOpen] = useState(false);
  return (
    <section className="card admin-section danger-zone">
      <div className="card-header">
        <div>
          <h2><ShieldAlert size={16} /> {archive ? "Archived" : "Danger zone"}</h2>
          <p>
            {archive
              ? `Archived by ${archive.by}${archive.reason ? `: “${archive.reason}”` : ""}. Its users can't sign in until it's restored.`
              : "Archiving signs everyone out and stops billing. Nothing is deleted; it can be restored."}
          </p>
        </div>
        <button type="button" className={archive ? "button button-primary" : "button button-danger"} onClick={() => setOpen(true)}>
          {archive ? <><ArchiveRestore size={14} /> Restore</> : <><Archive size={14} /> Archive</>}
        </button>
      </div>
      {open && (archive ? <RestoreDialog tenantId={tenantId} name={name} onClose={() => setOpen(false)} /> : <ArchiveDialog tenantId={tenantId} name={name} onClose={() => setOpen(false)} />)}
    </section>
  );
}
