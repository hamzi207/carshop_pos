import { Suspense } from "react";
import Link from "next/link";
import { ThemeToggle } from "@/components/shared/theme-toggle";
import { UserMenu } from "@/components/shared/user-menu";
import { requireSuperadmin } from "@/lib/superadmin";
import { BrandLockup } from "@/components/shared/brand";
import { AdminNavLinks } from "./admin-nav-links";

const initials = (name: string) =>
  name.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]!.toUpperCase()).join("");

async function AdminProfile() {
  const me = await requireSuperadmin();
  return <UserMenu initials={initials(me.fullName)} fullName={me.fullName} email={me.email} roleLabel="Superadmin" />;
}

/** /admin top bar: dark slate with the emerald accent, platform sections, light/dark, the superadmin's menu. */
export function AdminNavbar() {
  return (
    <header className="admin-navbar">
      <Link href="/admin" className="admin-brand" aria-label="Superadmin overview">
        <BrandLockup className="admin-lockup" />
        <span className="admin-tag">SUPERADMIN</span>
      </Link>
      {/* usePathname() is request data: it streams in after the static shell. */}
      <Suspense fallback={<nav className="admin-nav" aria-label="Superadmin" />}>
        <AdminNavLinks />
      </Suspense>
      <div className="admin-navbar-end">
        <ThemeToggle className="icon-button theme-toggle admin-theme-toggle" />
        <Suspense fallback={<div className="profile"><div className="avatar" /></div>}>
          <AdminProfile />
        </Suspense>
      </div>
    </header>
  );
}
