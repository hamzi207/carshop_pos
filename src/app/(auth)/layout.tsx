import type { ReactNode } from "react";
import { Car, FileText, ShieldCheck } from "lucide-react";
import { Brand } from "@/components/shared/brand";

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="auth-shell">
      <aside className="auth-aside">
        <Brand />
        <div className="auth-pitch">
          <span className="eyebrow">POS &amp; QUOTING ENGINE</span>
          <h2>Quote the right part for the right vehicle, every time.</h2>
          <p>
            Built for tint, wrap, PPF, audio and styling shops. Match inventory to Year / Make /
            Model, send quotes over WhatsApp, and keep stock in sync as you invoice.
          </p>
          <ul className="auth-points">
            <li>
              <span className="header-icon"><Car size={15} /></span>
              Magic Fit filtering by Year, Make &amp; Model
            </li>
            <li>
              <span className="header-icon"><FileText size={15} /></span>
              Professional PDF quotes with optional labor lines
            </li>
            <li>
              <span className="header-icon"><ShieldCheck size={15} /></span>
              Every shop&apos;s data isolated by row-level security
            </li>
          </ul>
        </div>
        <div className="version">CarShop.Pk POS System</div>
      </aside>
      <main className="auth-main">{children}</main>
    </div>
  );
}
