"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Popover } from "radix-ui";
import { AlarmClock, Bell, CalendarClock, CheckCircle2, PackageX } from "lucide-react";
import type { AlertsResponse, ShopAlert } from "@/app/api/notifications/route";

const SEEN_KEY = "carshop.seenAlerts";
const REFRESH_MS = 2 * 60 * 1000;

function readSeen(): string[] {
  try {
    const raw = localStorage.getItem(SEEN_KEY);
    return raw ? (JSON.parse(raw) as string[]) : [];
  } catch {
    return [];
  }
}

/** Icon by what the alert is about (the colour says how urgent it is). */
const iconFor = (key: string) => (key.startsWith("stock:") ? PackageX : key.startsWith("overdue:") || key.startsWith("due:") ? AlarmClock : CalendarClock);

/** Top-bar bell: live shop alerts (overdue / due invoices, low stock, expiring quotations). Unread = not opened yet in this browser. */
export function NotificationBell() {
  const [alerts, setAlerts] = useState<ShopAlert[] | null>(null);
  // null until the first load (localStorage is browser-only).
  const [seen, setSeen] = useState<string[] | null>(null);
  const [open, setOpen] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch("/api/notifications").catch(() => null);
    if (!res?.ok) return;
    // Signed out meanwhile (e.g. deactivated): the request was redirected to the login page, not JSON.
    const body = (await res.json().catch(() => null)) as AlertsResponse | null;
    if (!body) return;
    setAlerts(body.alerts);
    setSeen((prev) => prev ?? readSeen());
  }, []);

  useEffect(() => {
    // First load right after mount, then every 2 minutes and whenever the tab regains focus.
    const first = setTimeout(() => void load(), 0);
    const timer = setInterval(() => void load(), REFRESH_MS);
    const onFocus = () => void load();
    window.addEventListener("focus", onFocus);
    return () => {
      clearTimeout(first);
      clearInterval(timer);
      window.removeEventListener("focus", onFocus);
    };
  }, [load]);

  const unread = seen ? (alerts ?? []).filter((a) => !seen.includes(a.key)).length : 0;

  const onOpenChange = (next: boolean) => {
    setOpen(next);
    if (next) {
      void load();
      // Opening marks what's listed as seen (kept to current alerts so the list doesn't grow forever).
      const keys = (alerts ?? []).map((a) => a.key);
      setSeen(keys);
      try {
        localStorage.setItem(SEEN_KEY, JSON.stringify(keys));
      } catch {
        // Storage blocked: the count just comes back on reload.
      }
    }
  };

  return (
    <Popover.Root open={open} onOpenChange={onOpenChange}>
      <Popover.Trigger asChild>
        <button type="button" className="notification" aria-label={unread ? `Notifications, ${unread} new` : "Notifications"}>
          <Bell size={18} />
          {unread > 0 && <span className="notification-dot">{unread > 9 ? "9+" : unread}</span>}
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content className="alerts-panel" align="end" sideOffset={10} collisionPadding={12}>
          <div className="alerts-head">
            <strong>Notifications</strong>
            <span>{alerts ? `${alerts.length} ${alerts.length === 1 ? "alert" : "alerts"}` : "Loading…"}</span>
          </div>
          {alerts && alerts.length === 0 ? (
            <div className="alerts-empty">
              <CheckCircle2 size={22} />
              <strong>All clear</strong>
              <span>No overdue invoices, low stock or expiring quotations.</span>
            </div>
          ) : (
            <ul className="alerts-list">
              {(alerts ?? []).map((a) => {
                const Icon = iconFor(a.key);
                return (
                  <li key={a.key}>
                    <Link href={a.href} className="alert-item" onClick={() => setOpen(false)}>
                      <span className={`alert-icon ${a.tone}`}><Icon size={15} /></span>
                      <span className="alert-text">
                        <strong>{a.title}</strong>
                        <small>{a.detail}</small>
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
