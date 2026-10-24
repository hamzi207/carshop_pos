"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, Library, Settings2, ShieldCheck, Store, Wallet } from "lucide-react";
import { sectionOf, type Section } from "./section-tab-list";

// Organizations, Catalog and Billing each group several pages, with tabs on the pages (section-tab-list.tsx).
const LINKS: { href: string; label: string; icon: typeof Store; section?: Section }[] = [
  { href: "/admin", label: "Overview", icon: LayoutDashboard },
  { href: "/admin/tenants", label: "Organizations", icon: Store, section: "shops" },
  { href: "/admin/categories", label: "Catalog", icon: Library, section: "catalog" },
  { href: "/admin/billing", label: "Billing", icon: Wallet, section: "billing" },
  { href: "/admin/team", label: "Team", icon: ShieldCheck },
  { href: "/admin/platform", label: "Platform", icon: Settings2 },
];

/** `pendingRequests`: category requests waiting (a badge on Catalog). */
export function AdminNavLinks({ pendingRequests = 0 }: { pendingRequests?: number }) {
  const pathname = usePathname();
  const current = sectionOf(pathname);
  return (
    <nav className="admin-nav" aria-label="Superadmin">
      {LINKS.map(({ href, label, icon: Icon, section }) => {
        // A group is active on any of its pages (the vehicle catalog lives under /admin/platform but is Catalog).
        const active = section ? current === section : href === "/admin" ? pathname === href : !current && pathname.startsWith(href);
        return (
          // Labels collapse to icons on narrow widths (globals.css), so the name stays in title / aria-label.
          <Link key={href} href={href} className={active ? "active" : undefined} aria-current={active ? "page" : undefined} aria-label={label} title={label}>
            <Icon size={15} /> <span>{label}</span>
            {section === "catalog" && pendingRequests > 0 && (
              <span className="nav-count" aria-label={`${pendingRequests} pending category requests`}>{pendingRequests}</span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}
