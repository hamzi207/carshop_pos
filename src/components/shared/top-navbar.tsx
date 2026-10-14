import { Suspense } from "react";
import { Bell, Search } from "lucide-react";
import { getShopSession } from "@/lib/auth";
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
      roleLabel={session.role === "admin" ? "Shop Administrator" : "Staff"}
    />
  );
}

/** Top bar ported from design/figma-ui/src/App.tsx (search wired up in a later phase). */
export function TopNavbar() {
  return (
    <header className="topbar">
      <div className="global-search">
        <Search size={18} />
        <span>Search inventory, quotes, or customers...</span>
        <kbd>⌘ K</kbd>
      </div>
      <div className="top-actions">
        <button type="button" className="notification" aria-label="Notifications">
          <Bell size={18} />
        </button>
        <Suspense fallback={<div className="profile"><div className="avatar" /></div>}>
          <ProfileSection />
        </Suspense>
      </div>
    </header>
  );
}
