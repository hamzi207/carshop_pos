"use client";

import { useCallback, useEffect, useRef, useState } from "react";

// Shared across mounts: a save can remount the form (or Next can rewrite the
// history entry) before the browser delivers the popstate, and the new
// instance must still know about the guard and any pending navigation.
/** URL of the page that currently has a guard entry on top of it. */
let guardHref: string | null = null;
/** What to do once the guard entry has been popped. */
let afterGuardPop: (() => void) | null = null;

// The guard entry carries this mark, so we know whether it's the current entry: after a save
// that stays on the page, `guardHref` still names the page, but once the user has left and
// come back the entry on top is an ordinary one (going "back off the guard" would leave).
const GUARD_MARK = "__carshopLeaveGuard";
const onGuardEntry = () => Boolean((window.history.state as Record<string, unknown> | null)?.[GUARD_MARK]);

const pushGuard = () => {
  window.history.pushState({ ...window.history.state, [GUARD_MARK]: true }, "", window.location.href);
  guardHref = window.location.href;
};

/**
 * Asks before leaving a form with unsaved changes.
 * - Reload / close tab: the browser's own prompt.
 * - Browser back: while dirty, a copy of the current history entry (the
 *   "guard") sits on top, so Back lands on the same page and we can ask.
 * - Links (back arrow, sidebar…): clicks are intercepted.
 * `leaving` is set when the user tries to go; `href` null means "browser back".
 * Use `leaveWith` for any navigation the form starts itself, so the guard
 * entry is taken off the history first.
 */
export function useLeaveGuard(dirty: boolean, enabled: boolean) {
  const [leaving, setLeaving] = useState<{ href: string | null } | null>(null);
  const dirtyRef = useRef(dirty);

  useEffect(() => {
    dirtyRef.current = dirty && enabled;
    if (!dirty || !enabled) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty, enabled]);

  useEffect(() => {
    const onPopState = () => {
      const next = afterGuardPop;
      if (next) {
        afterGuardPop = null;
        guardHref = null;
        next();
        return;
      }
      // Back from the guard lands on the same page underneath it.
      if (guardHref !== window.location.href) return;
      if (dirtyRef.current) {
        pushGuard();
        setLeaving({ href: null });
      } else {
        // Saved since the guard was added: carry on back, so one press is enough.
        guardHref = null;
        window.history.back();
      }
    };
    const onClick = (e: MouseEvent) => {
      if (!dirtyRef.current || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const link = (e.target as Element | null)?.closest?.("a[href]");
      if (!(link instanceof HTMLAnchorElement) || link.target === "_blank" || link.origin !== window.location.origin) return;
      if (link.pathname === window.location.pathname && link.search === window.location.search) return;
      e.preventDefault();
      e.stopPropagation();
      setLeaving({ href: link.pathname + link.search });
    };
    window.addEventListener("popstate", onPopState);
    document.addEventListener("click", onClick, true);
    return () => {
      window.removeEventListener("popstate", onPopState);
      document.removeEventListener("click", onClick, true);
    };
  }, []);

  useEffect(() => {
    if (dirty && enabled && !onGuardEntry()) pushGuard();
  }, [dirty, enabled]);

  const leaveWith = useCallback((navigate: () => void) => {
    if (guardHref === window.location.href && onGuardEntry()) {
      afterGuardPop = navigate;
      window.history.back();
    } else {
      navigate();
    }
  }, []);

  return { leaving, setLeaving, leaveWith };
}
