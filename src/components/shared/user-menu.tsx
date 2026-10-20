"use client";

import Link from "next/link";
import { ChevronDown, LogOut, Monitor, Moon, ShieldCheck, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
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

const THEMES = [
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
  { value: "system", label: "System", icon: Monitor },
] as const;

export function UserMenu({ initials, fullName, email, roleLabel, isSuperadmin = false }: UserMenuProps) {
  // RF-16.4: theme for this browser (see theme-provider.tsx).
  const { theme, setTheme } = useTheme();
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
        <DropdownMenuLabel className="text-xs font-medium text-muted-foreground">Theme</DropdownMenuLabel>
        <DropdownMenuRadioGroup value={theme} onValueChange={setTheme}>
          {THEMES.map(({ value, label, icon: Icon }) => (
            <DropdownMenuRadioItem key={value} value={value} onSelect={(e) => e.preventDefault()}>
              <Icon />
              {label}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => void signOut()}>
          <LogOut />
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
