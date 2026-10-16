"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { Menu } from "lucide-react";

// Phones (≤ 768px): the sidebar is a slide-out menu. Open state lives on <html data-mobile-nav="open">
// so the sidebar, the backdrop and this button (in different parts of the layout) all follow it via CSS.

const setOpen = (open: boolean) => {
  if (open) document.documentElement.dataset.mobileNav = "open";
  else delete document.documentElement.dataset.mobileNav;
};

/** ☰ button in the top bar (shown on phones only). */
export function MobileNavButton() {
  return (
    <button type="button" className="icon-button mobile-nav-button" aria-label="Open menu" onClick={() => setOpen(true)}>
      <Menu size={20} />
    </button>
  );
}

/** Backdrop behind the open menu; closes it on tap, on Escape and after every navigation. */
export function MobileNavScrim() {
  const pathname = usePathname();
  useEffect(() => setOpen(false), [pathname]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  return <div className="mobile-nav-scrim" aria-hidden="true" onClick={() => setOpen(false)} />;
}
