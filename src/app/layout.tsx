import type { ReactNode } from "react";
import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import Script from "next/script";
import { Toaster } from "@/components/ui/sonner";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
});

export const metadata: Metadata = {
  title: {
    default: "CarShop.Pk POS System — Invoicing & Inventory for Auto Accessory Shops",
    template: "%s · CarShop.Pk POS",
  },
  description:
    "Cloud POS, YMM-aware inventory and quoting engine for automotive accessory sellers: tint, wraps, PPF, audio and styling parts.",
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
  themeColor: "#111113",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    // Browser extensions (and next-themes) add attributes to <html> before React
    // hydrates; this ignores attribute diffs on this one element only.
    <html lang="en" className={`${inter.variable} antialiased`} suppressHydrationWarning>
      <body>
        {/* Before hydration: restore a collapsed sidebar (see SidebarToggle) so it doesn't flash open. */}
        <Script id="sidebar-pref" strategy="beforeInteractive">
          {`try{if(localStorage.getItem("carshop.sidebar")==="collapsed")document.documentElement.dataset.sidebar="collapsed"}catch(e){}`}
        </Script>
        {children}
        <Toaster position="top-right" richColors closeButton />
      </body>
    </html>
  );
}
