"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Dialog } from "radix-ui";
import { FileText, Loader2, Package, Search, Users, type LucideIcon } from "lucide-react";
import type { SearchHit, SearchResponse } from "@/app/api/search/route";
import { ShortcutHint } from "./shortcut-hint";

const GROUPS: { key: keyof SearchResponse; label: string; icon: LucideIcon }[] = [
  { key: "documents", label: "Documents", icon: FileText },
  { key: "customers", label: "Customers", icon: Users },
  { key: "items", label: "Products", icon: Package },
];

/** Top-bar search: opens with a click or Ctrl/⌘ K; finds documents, customers and parts. */
export function GlobalSearch() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <>
      <button type="button" className="global-search" onClick={() => setOpen(true)} aria-label="Search inventory, quotes or customers">
        <Search size={18} />
        <span>Search inventory, quotes, or customers...</span>
        <ShortcutHint letter="K" />
      </button>
      <Dialog.Root open={open} onOpenChange={setOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="modal-backdrop search-backdrop">
            <Dialog.Content className="search-modal" aria-describedby={undefined}>
              <Dialog.Title className="sr-only">Search</Dialog.Title>
              {open && <SearchPanel onClose={() => setOpen(false)} />}
            </Dialog.Content>
          </Dialog.Overlay>
        </Dialog.Portal>
      </Dialog.Root>
    </>
  );
}

function SearchPanel({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [results, setResults] = useState<SearchResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [active, setActive] = useState(0);
  const request = useRef(0);

  // Debounced search; only the latest answer is shown.
  useEffect(() => {
    const term = q.trim();
    if (!term) return;
    const id = ++request.current;
    const timer = setTimeout(async () => {
      setLoading(true);
      const res = await fetch(`/api/search?q=${encodeURIComponent(term)}`).catch(() => null);
      const body = ((res?.ok ? await res.json().catch(() => null) : null) as SearchResponse | null) ?? { customers: [], items: [], documents: [] };
      if (id !== request.current) return;
      setResults(body);
      setActive(0);
      setLoading(false);
    }, 200);
    return () => clearTimeout(timer);
  }, [q]);

  const shown = q.trim() ? results : null;
  const flat: SearchHit[] = shown ? GROUPS.flatMap((g) => shown[g.key]) : [];
  const go = (hit: SearchHit | undefined) => {
    if (!hit) return;
    onClose();
    router.push(hit.href);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => Math.min(a + 1, flat.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      go(flat[active]);
    }
  };

  let index = -1;
  return (
    <div className="search-panel" onKeyDown={onKeyDown}>
      <div className="search-input">
        {loading ? <Loader2 size={18} className="animate-spin" /> : <Search size={18} />}
        <input
          autoFocus
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search invoice numbers, customers, products or SKUs…"
          aria-label="Search"
          maxLength={100}
          role="combobox"
          aria-expanded={flat.length > 0}
          aria-controls="search-results"
          aria-activedescendant={flat.length ? `search-hit-${active}` : undefined}
        />
        <kbd>Esc</kbd>
      </div>
      <div className="search-results" id="search-results" role="listbox">
        {!q.trim() && <p className="search-empty">Type a document number (INV-1001), a customer&apos;s name or phone, or a product name / SKU.</p>}
        {shown && flat.length === 0 && !loading && <p className="search-empty">Nothing found for &ldquo;{q.trim()}&rdquo;.</p>}
        {shown &&
          GROUPS.map(({ key, label, icon: Icon }) =>
            shown[key].length === 0 ? null : (
              <div key={key} className="search-group">
                <span className="search-group-label">{label}</span>
                {shown[key].map((hit) => {
                  index += 1;
                  const i = index;
                  return (
                    <button
                      key={hit.href + hit.title}
                      id={`search-hit-${i}`}
                      type="button"
                      role="option"
                      aria-selected={i === active}
                      className={`search-hit${i === active ? " active" : ""}`}
                      onMouseEnter={() => setActive(i)}
                      onClick={() => go(hit)}
                    >
                      <span className="search-hit-icon"><Icon size={15} /></span>
                      <span className="search-hit-text">
                        <strong>{hit.title}</strong>
                        <small>{hit.detail}</small>
                      </span>
                      {hit.badge && <span className="badge">{hit.badge}</span>}
                    </button>
                  );
                })}
              </div>
            ),
          )}
      </div>
    </div>
  );
}
