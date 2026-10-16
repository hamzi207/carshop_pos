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

// A left swipe of at least this much (or a quick flick) closes the open menu.
const SWIPE_CLOSE_PX = 70;
const FLICK_PX_PER_MS = 0.5;

/** Backdrop behind the open menu; closes it on tap, on Escape, on a left swipe and after every navigation. */
export function MobileNavScrim() {
  const pathname = usePathname();
  useEffect(() => setOpen(false), [pathname]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Swipe to close: the drawer follows the finger (CSS var --drawer-drag) while it moves
  // left; a vertical move is left to the menu's own scrolling.
  useEffect(() => {
    const root = document.documentElement;
    let start: { x: number; y: number; t: number } | null = null;
    let dragging = false;
    let dx = 0;

    const reset = () => {
      start = null;
      dragging = false;
      dx = 0;
      delete root.dataset.mobileNavDragging;
      root.style.removeProperty("--drawer-drag");
    };

    const onStart = (e: TouchEvent) => {
      if (root.dataset.mobileNav !== "open" || e.touches.length !== 1) return;
      const target = e.target as Element | null;
      if (!target?.closest(".sidebar, .mobile-nav-scrim")) return;
      const t = e.touches[0];
      start = { x: t.clientX, y: t.clientY, t: e.timeStamp };
    };

    const onMove = (e: TouchEvent) => {
      if (!start) return;
      const t = e.touches[0];
      const moveX = t.clientX - start.x;
      const moveY = t.clientY - start.y;
      if (!dragging) {
        if (Math.abs(moveX) < 8 && Math.abs(moveY) < 8) return;
        if (Math.abs(moveY) > Math.abs(moveX) || moveX > 0) return reset(); // scroll, or a right swipe
        dragging = true;
        root.dataset.mobileNavDragging = "";
      }
      dx = Math.min(0, moveX);
      root.style.setProperty("--drawer-drag", `${dx}px`);
    };

    const onEnd = (e: TouchEvent) => {
      if (start && dragging) {
        const speed = -dx / Math.max(1, e.timeStamp - start.t);
        if (-dx > SWIPE_CLOSE_PX || speed > FLICK_PX_PER_MS) setOpen(false);
      }
      reset();
    };

    document.addEventListener("touchstart", onStart, { passive: true });
    document.addEventListener("touchmove", onMove, { passive: true });
    document.addEventListener("touchend", onEnd);
    document.addEventListener("touchcancel", reset);
    return () => {
      document.removeEventListener("touchstart", onStart);
      document.removeEventListener("touchmove", onMove);
      document.removeEventListener("touchend", onEnd);
      document.removeEventListener("touchcancel", reset);
      reset();
    };
  }, []);

  return <div className="mobile-nav-scrim" aria-hidden="true" onClick={() => setOpen(false)} />;
}
