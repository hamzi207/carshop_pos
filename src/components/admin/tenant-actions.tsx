"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Ban, CheckCircle2, ChevronDown, Clock, LogIn, Pencil } from "lucide-react";
import { ConfirmDialog, type ConfirmRequest } from "@/components/quotes/confirm-dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { setTenantStatus, startImpersonation } from "@/lib/actions/admin";
import { notify } from "@/lib/notify";
import { TENANT_STATUS_LABEL, type TenantStatus } from "@/lib/validations/admin.schema";

type Props = {
  tenantId: string;
  name: string;
  status: string;
  /** The shops list links to the edit page; the edit page itself doesn't. */
  showEdit?: boolean;
};

/** Login As + status changes for one shop (shops list rows and the shop page header). */
export function TenantActions({ tenantId, name, status, showEdit = true }: Props) {
  const [pending, startTransition] = useTransition();
  const [confirm, setConfirm] = useState<ConfirmRequest | null>(null);

  const loginAs = () =>
    startTransition(async () => {
      // Redirects to the shop's dashboard on success.
      const result = await startImpersonation(tenantId);
      if (result.status === "error") notify.error("Couldn't open the shop", result.message);
    });

  const change = (next: TenantStatus) => {
    const run = async () => {
      const result = await setTenantStatus(tenantId, next);
      setConfirm(null);
      if (result.status === "error") {
        notify.error("Status not changed", result.message);
        return;
      }
      notify.success(
        `${name} is now ${TENANT_STATUS_LABEL[next].toLowerCase()}`,
        next === "suspended" ? "Its users are signed out and can't sign in until you activate it." : "Its users can sign in.",
      );
    };
    if (next !== "suspended") return startTransition(run);
    setConfirm({
      title: `Suspend ${name}?`,
      body: "Everyone in this shop is signed out at their next click and can't sign in; they see a message asking them to contact support. Nothing is deleted, and you can activate it again at any time.",
      confirmLabel: "Suspend Shop",
      icon: <Ban size={18} />,
      tone: "danger",
      onConfirm: () => startTransition(run),
    });
  };

  return (
    <div className="row-actions admin-row-actions">
      <button type="button" className="button" disabled={pending} onClick={loginAs}>
        <LogIn size={14} /> Login As
      </button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button type="button" className="icon-button" disabled={pending} aria-label={`More actions for ${name}`}>
            <ChevronDown size={15} />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-auto min-w-48">
          {showEdit && (
            <>
              <DropdownMenuItem asChild>
                <Link href={`/admin/tenants/${tenantId}`}><Pencil size={14} /> Edit company details</Link>
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
            <DropdownMenuItem variant="destructive" onSelect={() => change("suspended")}><Ban size={14} /> Suspend</DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
      <ConfirmDialog request={confirm} pending={pending} onOpenChange={(open) => !open && setConfirm(null)} />
    </div>
  );
}
