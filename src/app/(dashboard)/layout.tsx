import { Suspense, type ReactNode } from "react";
import { AppSidebar } from "@/components/shared/app-sidebar";
import { StoreCard, StoreCardSkeleton } from "@/components/shared/store-card";
import { TopNavbar } from "@/components/shared/top-navbar";

/**
 * Multi-tenant dashboard shell. The chrome is static; anything that reads the
 * session (shop name, user profile, page data) streams in behind <Suspense>.
 * The proxy already redirects signed-out users to /login before this renders.
 */
export default function DashboardLayout({ children }: { children: ReactNode }) {
  return (
    <div className="app-shell">
      <AppSidebar
        storeCard={
          <Suspense fallback={<StoreCardSkeleton />}>
            <StoreCard />
          </Suspense>
        }
      />
      <div className="main-shell">
        <TopNavbar />
        <main>{children}</main>
      </div>
    </div>
  );
}
