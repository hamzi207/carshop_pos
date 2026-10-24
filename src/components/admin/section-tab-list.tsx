"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Building2, CarFront, CreditCard, FolderTree, Inbox, ScrollText, SlidersHorizontal, Store, Users, Wallet } from "lucide-react";

// Top-nav items that group several pages; each page in a group shows the group's tabs.
// Catalog (Phase 18) is platform data every organization builds on. Vehicles are the Vehicle Fitment
// module's catalog, so they sit there rather than under Platform.
export const SECTIONS = {
  shops: [
    { href: "/admin/tenants", label: "Organizations", icon: Store },
    { href: "/admin/users", label: "Users", icon: Users },
  ],
  catalog: [
    { href: "/admin/industries", label: "Industries", icon: Building2 },
    { href: "/admin/categories", label: "Categories", icon: FolderTree },
    { href: "/admin/attributes", label: "Attributes", icon: SlidersHorizontal },
    { href: "/admin/platform/vehicles", label: "Vehicle catalog", icon: CarFront },
    { href: "/admin/categories/requests", label: "Requests", icon: Inbox },
  ],
  billing: [
    { href: "/admin/billing", label: "Billing", icon: Wallet },
    { href: "/admin/plans", label: "Plans", icon: CreditCard },
    { href: "/admin/audit", label: "Audit log", icon: ScrollText },
  ],
} as const;

export type Section = keyof typeof SECTIONS;

const under = (pathname: string, href: string) => pathname === href || pathname.startsWith(`${href}/`);

/** The tab a path belongs to: the most specific match (/admin/categories/requests is not "Categories"). */
function activeTab(pathname: string) {
  let best: { section: Section; href: string } | null = null;
  for (const [section, tabs] of Object.entries(SECTIONS) as [Section, (typeof SECTIONS)[Section]][]) {
    for (const t of tabs) if (under(pathname, t.href) && t.href.length > (best?.href.length ?? 0)) best = { section, href: t.href };
  }
  return best;
}

/** The group a path belongs to (for the top nav's highlight), or null. */
export const sectionOf = (pathname: string) => activeTab(pathname)?.section ?? null;

/** `pathname` null while prerendering (nothing highlighted). `badges`: counts by tab href. */
export function SectionTabList({ section, pathname, badges = {} }: { section: Section; pathname: string | null; badges?: Record<string, number> }) {
  const active = pathname ? activeTab(pathname)?.href : undefined;
  return (
    <nav className="settings-tabs section-tabs" aria-label="Section pages">
      {SECTIONS[section].map(({ href, label, icon: Icon }) => (
        <Link key={href} href={href} className={active === href ? "active" : undefined} aria-current={active === href ? "page" : undefined}>
          <Icon size={14} /> {label}
          {(badges[href] ?? 0) > 0 && <span className="badge badge-amber">{badges[href]}</span>}
        </Link>
      ))}
    </nav>
  );
}

export function ActiveSectionTabs(props: { section: Section; badges?: Record<string, number> }) {
  return <SectionTabList {...props} pathname={usePathname()} />;
}
