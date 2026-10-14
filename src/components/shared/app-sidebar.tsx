"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ChevronRight,
  FileText,
  LayoutGrid,
  LineChart,
  Package,
  Settings,
  Sparkles,
  Users,
  type LucideIcon,
} from "lucide-react";
import { Brand } from "./brand";

type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  /** Page not built yet (later phase): shown disabled. */
  comingSoon?: boolean;
};

const workspaceNav: NavItem[] = [
  { href: "/dashboard", label: "Overview", icon: LayoutGrid },
  { href: "/quotes", label: "Quotes & POS", icon: FileText, comingSoon: true },
  { href: "/inventory", label: "Inventory", icon: Package, comingSoon: true },
  { href: "/customers", label: "Customers", icon: Users, comingSoon: true },
];

const insightsNav: NavItem[] = [
  { href: "/reports", label: "Reports", icon: LineChart, comingSoon: true },
  { href: "/settings", label: "Settings", icon: Settings, comingSoon: true },
];

function NavLink({ item, active }: { item: NavItem; active: boolean }) {
  const Icon = item.icon;
  if (item.comingSoon) {
    return (
      <span className="nav-item" aria-disabled="true" title="Coming soon" style={{ opacity: 0.55, cursor: "default" }}>
        <Icon size={18} />
        <span>{item.label}</span>
      </span>
    );
  }
  return (
    <Link href={item.href} className={`nav-item ${active ? "active" : ""}`} aria-current={active ? "page" : undefined}>
      <Icon size={18} />
      <span>{item.label}</span>
    </Link>
  );
}

/**
 * Dashboard sidebar ported from design/figma-ui/src/App.tsx.
 * `storeCard` is server-rendered (it needs the session) and streamed in.
 */
export function AppSidebar({ storeCard }: { storeCard: ReactNode }) {
  const pathname = usePathname();
  const isActive = (href: string) => pathname === href || pathname.startsWith(`${href}/`);

  return (
    <aside className="sidebar">
      <Brand />
      {storeCard}
      <nav className="nav">
        <span className="nav-label">WORKSPACE</span>
        {workspaceNav.map((item) => (
          <NavLink key={item.href} item={item} active={isActive(item.href)} />
        ))}
        <span className="nav-label nav-label-gap">INSIGHTS</span>
        {insightsNav.map((item) => (
          <NavLink key={item.href} item={item} active={isActive(item.href)} />
        ))}
      </nav>
      <div className="sidebar-foot">
        <div className="help-card">
          <div className="help-icon">
            <Sparkles size={16} />
          </div>
          <strong>Need a hand?</strong>
          <span>Visit the Apex support center.</span>
          <button type="button">
            Get support <ChevronRight size={13} />
          </button>
        </div>
        <div className="version">ApexOS v2.4.0</div>
      </div>
    </aside>
  );
}
