import { Suspense, type ReactNode } from "react";
import { ImpersonationBanner } from "@/components/admin/impersonation-banner";
import { AppSidebar } from "@/components/shared/app-sidebar";
import { TopNavbar } from "@/components/shared/top-navbar";

/**
 * Multi-tenant dashboard shell. The chrome is static; anything that reads the
 * session (shop name, user profile, page data) streams in behind <Suspense>.
 * The proxy already redirects signed-out users to /login before this renders.
 */
export default function DashboardLayout({ children }: { children: ReactNode }) {
  return (
    <div className="app-shell">
      <AppSidebar />
      <div className="main-shell">
        {/* Superadmin acting as this shop ("Login As"): who, until when, and Exit. */}
        <Suspense>
          <ImpersonationBanner />
        </Suspense>
        <TopNavbar />
        <main>{children}</main>
      </div>
    </div>
  );
}
