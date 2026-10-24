import { Suspense, type ReactNode } from "react";
import { SettingsTabList, SettingsTabs } from "@/components/settings/settings-tabs";

// Settings sections (Phase 14): each tab is its own page with its own Save Settings bar.
export default function SettingsLayout({ children }: { children: ReactNode }) {
  return (
    <div className="page settings-page shop-settings">
      <div className="page-heading">
        <div>
          <span className="eyebrow">SHOP SETTINGS</span>
          <h1>Settings</h1>
        </div>
      </div>
      {/* usePathname() is request data: the highlighted tab streams in after the static shell. */}
      <Suspense fallback={<SettingsTabList pathname={null} />}>
        <SettingsTabs />
      </Suspense>
      {children}
    </div>
  );
}
