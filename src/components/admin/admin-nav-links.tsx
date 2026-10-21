"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { CreditCard, LayoutDashboard, ScrollText, Settings2, ShieldCheck, Store, Users, Wallet } from "lucide-react";

const LINKS = [
  { href: "/admin", label: "Overview", icon: LayoutDashboard },
  { href: "/admin/tenants", label: "Shops", icon: Store },
  { href: "/admin/users", label: "Users", icon: Users },
  { href: "/admin/plans", label: "Plans", icon: CreditCard },
  { href: "/admin/billing", label: "Billing", icon: Wallet },
  { href: "/admin/audit", label: "Audit", icon: ScrollText },
  { href: "/admin/team", label: "Team", icon: ShieldCheck },
  { href: "/admin/platform", label: "Platform", icon: Settings2 },
];

export function AdminNavLinks() {
  const pathname = usePathname();
  return (
    <nav className="admin-nav" aria-label="Superadmin">
      {LINKS.map(({ href, label, icon: Icon }) => {
        const active = href === "/admin" ? pathname === href : pathname.startsWith(href);
        return (
          <Link key={href} href={href} className={active ? "active" : undefined} aria-current={active ? "page" : undefined}>
            <Icon size={15} /> <span>{label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
