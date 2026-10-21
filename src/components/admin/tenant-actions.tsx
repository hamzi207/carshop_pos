"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Archive, ArchiveRestore, Ban, CheckCircle2, ChevronDown, Clock, Eye, LogIn, Pencil } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { setTenantStatus, startImpersonation } from "@/lib/actions/admin";
import { notify } from "@/lib/notify";
import { TENANT_STATUS_LABEL, type TenantStatus } from "@/lib/validations/admin.schema";
import { ArchiveDialog, RestoreDialog, SuspendDialog } from "./tenant-danger-zone";

type Props = {
  tenantId: string;
  name: string;
  status: string;
  /** Archived organizations can only be opened or restored. */
  archived?: boolean;
  /** The shops list links to the edit page; the edit page itself doesn't. */
  showEdit?: boolean;
};

/** Login As + status changes + archive / restore for one shop (shops list rows and the shop page header). */
export function TenantActions({ tenantId, name, status, archived = false, showEdit = true }: Props) {
  const [pending, startTransition] = useTransition();
  const [dialog, setDialog] = useState<"suspend" | "archive" | "restore" | null>(null);

  const loginAs = (mode: "full" | "read_only" = "full") =>
    startTransition(async () => {
      // Redirects to the shop's dashboard on success.
      const result = await startImpersonation(tenantId, mode);
      if (result.status === "error") notify.error("Couldn't open the shop", result.message);
    });

  // Suspending asks for a reason first (SuspendDialog).
  const change = (next: Exclude<TenantStatus, "suspended">) =>
    startTransition(async () => {
      const result = await setTenantStatus(tenantId, next);
      if (result.status === "error") notify.error("Status not changed", result.message);
      else notify.success(`${name} is now ${TENANT_STATUS_LABEL[next].toLowerCase()}`, "Its users can sign in.");
    });

  const close = () => setDialog(null);
  const dialogs = (
    <>
      {dialog === "suspend" && <SuspendDialog tenantId={tenantId} name={name} onClose={close} />}
      {dialog === "archive" && <ArchiveDialog tenantId={tenantId} name={name} onClose={close} />}
      {dialog === "restore" && <RestoreDialog tenantId={tenantId} name={name} onClose={close} />}
    </>
  );

  if (archived) {
    return (
      <div className="row-actions admin-row-actions">
        <button type="button" className="button" onClick={() => setDialog("restore")}>
          <ArchiveRestore size={14} /> Restore
        </button>
        {dialogs}
      </div>
    );
  }

  return (
    <div className="row-actions admin-row-actions">
      <button type="button" className="button" disabled={pending} onClick={() => loginAs("full")}>
        <LogIn size={14} /> Login As
      </button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button type="button" className="icon-button" disabled={pending} aria-label={`More actions for ${name}`}>
            <ChevronDown size={15} />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-auto min-w-48">
          <DropdownMenuItem onSelect={() => loginAs("read_only")}><Eye size={14} /> Login As (read-only)</DropdownMenuItem>
          <DropdownMenuSeparator />
          {showEdit && (
            <>
              <DropdownMenuItem asChild>
                <Link href={`/admin/tenants/${tenantId}/profile`}><Pencil size={14} /> Edit company details</Link>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
            </>
          )}
          {status !== "active" && (
            <DropdownMenuItem onSelect={() => change("active")}><CheckCircle2 size={14} /> Activate</DropdownMenuItem>
          )}
          {status !== "trial" && (
            <DropdownMenuItem onSelect={() => change("trial")}><Clock size={14} /> Mark as trial</DropdownMenuItem>
          )}
          {status !== "suspended" && (
            <DropdownMenuItem variant="destructive" onSelect={() => setDialog("suspend")}><Ban size={14} /> Suspend</DropdownMenuItem>
          )}
          <DropdownMenuSeparator />
          <DropdownMenuItem variant="destructive" onSelect={() => setDialog("archive")}><Archive size={14} /> Archive</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      {dialogs}
    </div>
  );
}
