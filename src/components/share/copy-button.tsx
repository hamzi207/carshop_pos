"use client";

import { useEffect, useState } from "react";
import { Check, Copy } from "lucide-react";

/** Copies `value` and shows "Copied" for 2 seconds; on the public share page, so no toast. */
export function CopyButton({ value, label }: { value: string; label: string }) {
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");
  useEffect(() => {
    if (state === "idle") return;
    const t = setTimeout(() => setState("idle"), 2000);
    return () => clearTimeout(t);
  }, [state]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setState("copied");
    } catch {
      setState("failed");
    }
  };

  return (
    <button type="button" className={`share-copy${state === "copied" ? " copied" : ""}`} onClick={copy} aria-live="polite">
      {state === "copied" ? <Check size={13} /> : <Copy size={13} />}
      {state === "copied" ? "Copied" : state === "failed" ? "Select and copy" : label}
    </button>
  );
}
