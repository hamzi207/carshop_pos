"use client";

import Link from "next/link";
import { ChevronDown, LogOut, ShieldCheck } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { signOut } from "@/lib/actions/auth";

type UserMenuProps = {
  initials: string;
  fullName: string;
  email: string;
  roleLabel: string;
  /** Platform operators get a link to the /admin console. */
  isSuperadmin?: boolean;
};

export function UserMenu({ initials, fullName, email, roleLabel, isSuperadmin = false }: UserMenuProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button type="button" className="profile" style={{ border: 0, borderLeft: "1px solid var(--slate-200)", background: "transparent", textAlign: "left" }}>
          <div className="avatar">{initials}</div>
          <div>
            <strong>{fullName}</strong>
            <span>{roleLabel}</span>
          </div>
          <ChevronDown size={14} style={{ color: "var(--slate-400)", marginLeft: 3 }} />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel>
          <div className="text-sm font-semibold">{fullName}</div>
          <div className="text-xs font-normal text-muted-foreground">{email}</div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {isSuperadmin && (
          <>
            <DropdownMenuItem asChild>
              <Link href="/admin">
                <ShieldCheck />
                Superadmin console
              </Link>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
          </>
        )}
        <DropdownMenuItem onSelect={() => void signOut()}>
          <LogOut />
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
