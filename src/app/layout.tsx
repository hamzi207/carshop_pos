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
    default: "Apex POS — Quoting & Inventory for Auto Accessory Shops",
    template: "%s · Apex POS",
  },
  description:
    "Cloud POS, YMM-aware inventory and quoting engine for automotive accessory sellers: tint, wraps, PPF, audio and styling parts.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} antialiased`}>
      <body>
        {children}
        <Toaster position="top-right" />
      </body>
    </html>
  );
}
