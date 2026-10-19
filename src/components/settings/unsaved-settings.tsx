"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Save, Undo2 } from "lucide-react";
import { LeaveDialog } from "@/components/quotes/leave-dialog";
import { useLeaveGuard } from "@/lib/hooks/use-leave-guard";
import { notify } from "@/lib/notify";

type Entry = {
  /** "Your shop", "Shop settings": named in the save bar. */
  label: string;
  /** Validates and saves; false when it didn't save (errors are shown in the form). */
  save: () => Promise<boolean>;
  /** Back to the last saved values. */
  discard: () => void;
};

const Report = createContext<((id: string, entry: Entry | null) => void) | null>(null);

/**
 * Settings → one place to save. Forms report unsaved changes with useUnsavedSettings; while any
 * form has them, a bar pinned to the bottom of the screen offers Discard / Save Settings, and
 * leaving the page (links, back, reload) asks first. Nothing is saved until Save Settings.
 */
export function UnsavedSettings({ children }: { children: ReactNode }) {
  const router = useRouter();
  const entries = useRef(new Map<string, Entry>());
  /** Forms with unsaved changes, in the order they changed. */
  const [dirty, setDirty] = useState<{ id: string; label: string }[]>([]);
  const [saving, setSaving] = useState(false);
  const { leaving, setLeaving, leaveWith } = useLeaveGuard(dirty.length > 0, true);

  const report = useCallback((id: string, entry: Entry | null) => {
    if (entry) entries.current.set(id, entry);
    else entries.current.delete(id);
    setDirty((prev) => {
      const listed = prev.some((d) => d.id === id);
      if (listed === Boolean(entry)) return prev;
      return entry ? [...prev, { id, label: entry.label }] : prev.filter((d) => d.id !== id);
    });
  }, []);

  /** Saves every form with changes; true when all of them saved. */
  const saveAll = async () => {
    setSaving(true);
    let ok = true;
    for (const { id } of dirty) {
      const entry = entries.current.get(id);
      if (entry && !(await entry.save())) ok = false;
    }
    setSaving(false);
    if (!ok) notify.error("Settings not saved", "Check the highlighted settings and try again.");
    return ok;
  };
  const discardAll = () => {
    for (const { id } of dirty) entries.current.get(id)?.discard();
    notify.info("Changes discarded", "Your settings were left as they were last saved.");
  };
  const goTo = (href: string | null) => () => (href ? router.push(href) : window.history.back());
  const labels = dirty.map((d) => d.label).join(" · ");

  return (
    <Report.Provider value={report}>
      {children}
      {dirty.length > 0 && (
        <div className="settings-save-bar" role="region" aria-label="Unsaved settings">
          <span className="settings-save-text">
            <strong>Unsaved changes</strong>
            <small>{labels}</small>
          </span>
          <button type="button" className="button" disabled={saving} onClick={discardAll}>
            <Undo2 size={14} /> Discard
          </button>
          <button type="button" className="button button-primary" disabled={saving} onClick={() => void saveAll()}>
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} {saving ? "Saving…" : "Save Settings"}
          </button>
        </div>
      )}
      <LeaveDialog
        open={leaving !== null}
        what="your settings"
        saveLabel="Save Settings"
        pending={saving}
        onKeepEditing={() => setLeaving(null)}
        onDiscard={() => {
          const target = leaving?.href ?? null;
          setLeaving(null);
          discardAll();
          leaveWith(goTo(target));
        }}
        onSave={async () => {
          const target = leaving?.href ?? null;
          setLeaving(null);
          if (await saveAll()) leaveWith(goTo(target));
        }}
      />
    </Report.Provider>
  );
}

/** Registers a settings form with the page's save bar (see UnsavedSettings). */
export function useUnsavedSettings(id: string, label: string, dirty: boolean, save: () => Promise<boolean>, discard: () => void) {
  const report = useContext(Report);
  const latest = useRef({ save, discard });
  useEffect(() => {
    latest.current = { save, discard };
  });
  useEffect(() => {
    report?.(id, dirty ? { label, save: () => latest.current.save(), discard: () => latest.current.discard() } : null);
  }, [report, id, label, dirty]);
  useEffect(() => () => report?.(id, null), [report, id]);
}
