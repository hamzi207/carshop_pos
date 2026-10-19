import { Suspense } from "react";
import { getShopSession } from "@/lib/auth";
import { GlobalSearch } from "./global-search";
import { MobileNavButton } from "./mobile-nav";
import { NotificationBell } from "./notification-bell";
import { UserMenu } from "./user-menu";

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]!.toUpperCase())
    .join("");
}

async function ProfileSection() {
  const session = await getShopSession();
  return (
    <UserMenu
      initials={initials(session.fullName)}
      fullName={session.fullName}
      email={session.email}
      roleLabel={session.impersonating ? "Superadmin (acting)" : session.role === "admin" ? "Shop Administrator" : "Staff"}
      isSuperadmin={session.isSuperadmin}
    />
  );
}

/** Top bar ported from design/figma-ui/src/App.tsx: global search (Ctrl/⌘ K), notifications, profile. */
export function TopNavbar() {
  return (
    <header className="topbar">
      <MobileNavButton />
      <GlobalSearch />
      <div className="top-actions">
        <NotificationBell />
        <Suspense fallback={<div className="profile"><div className="avatar" /></div>}>
          <ProfileSection />
        </Suspense>
      </div>
    </header>
  );
}
