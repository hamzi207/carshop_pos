"use client";

import { useEffect } from "react";

/**
 * Publishes the on-screen keyboard's height as `--keyboard-inset` on <html> while mounted,
 * so bottom sheets can sit above it. Android shrinks the layout itself (interactive-widget
 * in layout.tsx) and reads 0 here; iOS Safari only shrinks the visual viewport.
 */
export function useKeyboardInset() {
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const root = document.documentElement;
    const update = () => {
      // Pinch-zoom also shrinks the visual viewport; that isn't a keyboard.
      const inset = vv.scale > 1.01 ? 0 : Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
      root.style.setProperty("--keyboard-inset", `${Math.round(inset)}px`);
    };
    update();
    vv.addEventListener("resize", update);
    vv.addEventListener("scroll", update);
    return () => {
      vv.removeEventListener("resize", update);
      vv.removeEventListener("scroll", update);
      root.style.removeProperty("--keyboard-inset");
    };
  }, []);
}
