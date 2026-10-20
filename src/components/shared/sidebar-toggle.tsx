"use client";

import { PanelLeftClose, PanelLeftOpen } from "lucide-react";

/** localStorage key; also read by the inline script in app/layout.tsx so a collapsed sidebar doesn't flash open. */
export const SIDEBAR_KEY = "productlogik.sidebar";

/**
 * Round button straddling the sidebar's right edge (rendered beside the sidebar, not inside it, so the
 * sidebar's scrolling doesn't clip it). Collapses the sidebar to icons, or expands it, by setting
 * data-sidebar on <html>; CSS does the rest. No React state, so server and client render the same.
 */
export function SidebarToggle() {
  const toggle = () => {
    const root = document.documentElement;
    const collapsed = root.dataset.sidebar !== "collapsed";
    if (collapsed) root.dataset.sidebar = "collapsed";
    else delete root.dataset.sidebar;
    try {
      localStorage.setItem(SIDEBAR_KEY, collapsed ? "collapsed" : "expanded");
    } catch {
      // Private mode / blocked storage: the choice just isn't remembered.
    }
  };

  return (
    <button type="button" className="sidebar-toggle" onClick={toggle} aria-label="Collapse or expand the sidebar" title="Collapse / expand sidebar">
      <PanelLeftClose size={16} strokeWidth={1.75} className="when-expanded" />
      <PanelLeftOpen size={16} strokeWidth={1.75} className="when-collapsed" />
    </button>
  );
}
