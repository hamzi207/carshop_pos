"use client";

import { useSyncExternalStore } from "react";
import { Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";

const noop = () => () => {};

/**
 * Light / dark switch in the top bar (shop dashboard and superadmin console). Flips what's on screen
 * now; "System" (follow the device) stays in the user menu. Renders an empty button until mounted:
 * the server can't know the theme, which lives in this browser.
 */
export function ThemeToggle({ className = "icon-button theme-toggle" }: { className?: string }) {
  const { resolvedTheme, setTheme } = useTheme();
  const mounted = useSyncExternalStore(noop, () => true, () => false);
  const dark = mounted && resolvedTheme === "dark";
  const label = dark ? "Switch to light mode" : "Switch to dark mode";
  return (
    <button type="button" className={className} aria-label={label} title={label} onClick={() => setTheme(dark ? "light" : "dark")}>
      {mounted && (dark ? <Sun size={16} /> : <Moon size={16} />)}
    </button>
  );
}
