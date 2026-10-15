"use client";

import { useSyncExternalStore } from "react";

const subscribe = () => () => {};
const isApple = () => /Mac|iPhone|iPad|iPod/i.test(navigator.userAgent);

/**
 * "⌘ K" on Apple devices, "Ctrl K" everywhere else. The server (and the first
 * client render) can't know the OS, so they show "Ctrl K"; Apple devices
 * switch right after hydration without a mismatch.
 */
export function ShortcutHint({ letter }: { letter: string }) {
  const apple = useSyncExternalStore(subscribe, isApple, () => false);
  return <kbd>{apple ? `⌘ ${letter}` : `Ctrl ${letter}`}</kbd>;
}
