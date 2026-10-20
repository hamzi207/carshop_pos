import { Suspense, type ReactNode } from "react";
import type { Metadata } from "next";
import { AdminNavbar } from "@/components/admin/admin-navbar";
import { ImpersonationBanner } from "@/components/admin/impersonation-banner";

export const metadata: Metadata = { title: { default: "Superadmin", template: "%s · Superadmin · ProductLogik POS" } };

/**
 * Platform control plane (Phase 13). The proxy sends non-superadmins to /dashboard;
 * every page and action checks again with requireSuperadmin().
 */
export default function AdminLayout({ children }: { children: ReactNode }) {
  return (
    <div className="admin-shell">
      <AdminNavbar />
      <Suspense>
        <ImpersonationBanner />
      </Suspense>
      <main className="admin-main">{children}</main>
    </div>
  );
}
