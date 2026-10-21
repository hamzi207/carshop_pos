"use client";

import { useSyncExternalStore } from "react";
import { Info, Megaphone, X } from "lucide-react";

const KEY = "hidden-announcements";
const listeners = new Set<() => void>();
// Used when the browser blocks storage: hidden until the page is reloaded.
let fallback = "[]";

// The raw stored string is the snapshot (stable between renders); null on the server and before
// hydration, so nothing shows until the hidden list is known and no hidden banner flashes.
function read() {
  try {
    return localStorage.getItem(KEY) ?? "[]";
  } catch {
    return fallback;
  }
}
function write(ids: string[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(ids));
  } catch {
    fallback = JSON.stringify(ids);
  }
  listeners.forEach((l) => l());
}
function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
function parse(raw: string): string[] {
  try {
    const v = JSON.parse(raw);
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

/** The banners, each hideable by this viewer on this device (remembered in the browser). */
export function AnnouncementItems({ items }: { items: { id: string; message: string; tone: "info" | "warning" }[] }) {
  const raw = useSyncExternalStore(subscribe, read, () => null);
  if (raw === null) return null;
  const hidden = parse(raw);

  const hide = (id: string) => {
    // Keep only ids still live, so the list doesn't grow forever.
    write([...hidden.filter((h) => items.some((i) => i.id === h)), id]);
  };

  return items
    .filter((a) => !hidden.includes(a.id))
    .map((a) => (
      <div key={a.id} className={`subscription-banner announcement-banner is-${a.tone}`} role={a.tone === "warning" ? "alert" : "status"}>
        {a.tone === "warning" ? <Megaphone size={16} /> : <Info size={16} />}
        <p>{a.message}</p>
        <button type="button" className="icon-button" aria-label="Hide this announcement" onClick={() => hide(a.id)}>
          <X size={14} />
        </button>
      </div>
    ));
}
