import type { ReactNode } from "react";
import type { Metadata } from "next";
import { KeyRound, ShieldCheck, Users } from "lucide-react";
import { BrandLockup } from "@/components/shared/brand";

export const metadata: Metadata = { title: { default: "Superadmin", template: "%s · Superadmin · ProductLogik POS" } };

/** The superadmin console's own sign-in pages (/admin/login, /admin/mfa), apart from the shops' /login. */
export default function AdminAuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="auth-shell admin-auth">
      <aside className="auth-aside">
        <BrandLockup />
        <div className="auth-pitch">
          <span className="eyebrow">SUPERADMIN CONSOLE</span>
          <h2>Run the platform.</h2>
          <p>Organizations, subscriptions and billing for every business on ProductLogik POS. For the ProductLogik team only.</p>
          <ul className="auth-points">
            <li>
              <span className="header-icon"><ShieldCheck size={15} /></span>
              Separate accounts from every shop
            </li>
            <li>
              <span className="header-icon"><KeyRound size={15} /></span>
              Password plus a code from your authenticator app
            </li>
            <li>
              <span className="header-icon"><Users size={15} /></span>
              Every action recorded in the audit log
            </li>
          </ul>
        </div>
        <div className="version">ProductLogik POS · Superadmin</div>
      </aside>
      <main className="auth-main">
        <BrandLockup tone="light" className="auth-mobile-logo" />
        {children}
      </main>
    </div>
  );
}
