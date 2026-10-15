import type { ReactNode } from "react";
import type { Metadata } from "next";
import { Inter } from "next/font/google";
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

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    // Browser extensions (and next-themes) add attributes to <html> before React
    // hydrates; this ignores attribute diffs on this one element only.
    <html lang="en" className={`${inter.variable} antialiased`} suppressHydrationWarning>
      <body>
        {children}
        <Toaster position="top-right" richColors closeButton />
      </body>
    </html>
  );
}
