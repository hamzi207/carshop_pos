import type { ReactNode } from "react";
import { FileText, Boxes, ShieldCheck } from "lucide-react";
import { BrandLockup, BuiltBy } from "@/components/shared/brand";

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="auth-shell">
      <aside className="auth-aside">
        <BrandLockup />
        <div className="auth-pitch">
          <span className="eyebrow">INVENTORY · INVOICING · BILLING</span>
          <h2>Know your stock. Bill it right. Get paid on time.</h2>
          <p>
            For retailers, wholesalers and distributors in any trade. Track stock, send quotations and
            invoices over WhatsApp, and keep every customer&apos;s balance up to date.
          </p>
          <ul className="auth-points">
            <li>
              <span className="header-icon"><Boxes size={15} /></span>
              Live stock that updates as you invoice
            </li>
            <li>
              <span className="header-icon"><FileText size={15} /></span>
              Professional PDF invoices and POS slips with your logo
            </li>
            <li>
              <span className="header-icon"><ShieldCheck size={15} /></span>
              Every business&apos;s data isolated by row-level security
            </li>
          </ul>
        </div>
        <div className="version">
          ProductLogik Invoicing System
          <BuiltBy />
        </div>
      </aside>
      <main className="auth-main">
        {/* Phones hide the dark side panel, so the logo sits above the form instead. */}
        <BrandLockup tone="light" className="auth-mobile-logo" />
        {children}
      </main>
    </div>
  );
}
