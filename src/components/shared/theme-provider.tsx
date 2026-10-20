"use client";

import type { ReactNode } from "react";
import { ThemeProvider as NextThemes } from "next-themes";

// RF-16.4: Light / Dark / System, remembered per browser (localStorage "theme"). next-themes sets the
// `dark` class on <html> before the page paints, so a reload doesn't flash. Documents stay light
// (globals.css, "Always light").
export function ThemeProvider({ children }: { children: ReactNode }) {
  return (
    <NextThemes attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
      {children}
    </NextThemes>
  );
}
