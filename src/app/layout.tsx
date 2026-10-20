import type { ReactNode } from "react";
import type { Metadata, Viewport } from "next";
import { Noto_Sans_Arabic, Plus_Jakarta_Sans } from "next/font/google";
import Script from "next/script";
import { ThemeProvider } from "@/components/shared/theme-provider";
import { Toaster } from "@/components/ui/sonner";
import "./globals.css";

const jakarta = Plus_Jakarta_Sans({
  variable: "--font-jakarta",
  subsets: ["latin", "latin-ext"],
});

// Urdu / Arabic-script names and notes (RF-16.2). Google's CSS limits it to Arabic code points
// (unicode-range), so it only downloads on pages that show such text. Noto Sans Arabic rather
// than Nastaliq: Nastaliq's tall line height breaks table rows and inputs.
const urdu = Noto_Sans_Arabic({
  variable: "--font-urdu",
  subsets: ["arabic"],
  preload: false,
});

export const metadata: Metadata = {
  title: {
    default: "ProductLogik POS — Inventory, Invoicing & Billing",
    template: "%s · ProductLogik POS",
  },
  applicationName: "ProductLogik POS",
  description:
    "Cloud inventory tracking, quotations, invoicing, statements of account and billing for retailers, wholesalers and distributors.",
};

// viewportFit "cover" lets the page run under the iPhone notch / home bar (the safe-area
// paddings in globals.css keep content clear of them); "resizes-content" shrinks the
// layout when the on-screen keyboard opens, so bottom-anchored controls stay visible.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  viewportFit: "cover",
  interactiveWidget: "resizes-content",
  themeColor: "#0f172a",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    // Browser extensions (and next-themes) add attributes to <html> before React
    // hydrates; this ignores attribute diffs on this one element only.
    <html lang="en" className={`${jakarta.variable} ${urdu.variable} antialiased`} suppressHydrationWarning>
      <body>
        {/* Before hydration: restore a collapsed sidebar (see SidebarToggle) so it doesn't flash open.
            "carshop.sidebar" is the Version 1 key, still read until Phase 33. */}
        <Script id="sidebar-pref" strategy="beforeInteractive">
          {`try{if((localStorage.getItem("productlogik.sidebar")||localStorage.getItem("carshop.sidebar"))==="collapsed")document.documentElement.dataset.sidebar="collapsed"}catch(e){}`}
        </Script>
        <ThemeProvider>
          {children}
          <Toaster position="top-right" richColors closeButton />
        </ThemeProvider>
      </body>
    </html>
  );
}
