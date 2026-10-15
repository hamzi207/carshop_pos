"use client";

import { useState } from "react";
import { Dialog } from "radix-ui";
import { Loader2, Save, SlidersHorizontal, X } from "lucide-react";
import { saveDashboardPrefs } from "@/lib/actions/dashboard";
import {
  CHART_HINT,
  DISPLAY_LABEL,
  WIDGET_DISPLAYS,
  WIDGET_HINT,
  WIDGET_LABEL,
  WIDGETS,
  type DashboardPrefs,
  type Display,
  type Widget,
} from "@/lib/dashboard";
import { notify } from "@/lib/notify";

/** Show / hide dashboard widgets and pick numbers, bars or a pie per card; saved per user. Dates are picked beside it. */
export function CustomizeDashboard({ prefs }: { prefs: DashboardPrefs }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className="button" onClick={() => setOpen(true)}>
        <SlidersHorizontal size={14} /> Customize
      </button>
      <Dialog.Root open={open} onOpenChange={setOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="modal-backdrop">
            <Dialog.Content className="modal">
              {/* Remounts on each open, so it starts from the saved choices. */}
              {open && <CustomizeForm prefs={prefs} onDone={() => setOpen(false)} />}
            </Dialog.Content>
          </Dialog.Overlay>
        </Dialog.Portal>
      </Dialog.Root>
    </>
  );
}

function CustomizeForm({ prefs, onDone }: { prefs: DashboardPrefs; onDone: () => void }) {
  const [widgets, setWidgets] = useState<Widget[]>(prefs.widgets);
  const [display, setDisplay] = useState<Record<Widget, Display>>(prefs.display);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const toggle = <T extends string>(list: T[], value: T, all: readonly T[]) =>
    all.filter((v) => (v === value ? !list.includes(v) : list.includes(v)));

  const save = async () => {
    setPending(true);
    setError(null);
    const result = await saveDashboardPrefs({ widgets, display });
    setPending(false);
    if (result.status === "error") {
      setError(result.message);
      notify.error("Dashboard not saved", result.message);
      return;
    }
    const charts = widgets.filter((w) => display[w] !== "numbers").length;
    notify.success(
      "Dashboard updated",
      `${widgets.length} of ${WIDGETS.length} widgets shown${charts ? `, ${charts} as charts` : ""}. Saved for your account only.`,
    );
    onDone();
  };

  return (
    <>
      <div className="modal-header">
        <div>
          <span className="header-icon blue"><SlidersHorizontal size={18} /></span>
          <div>
            <Dialog.Title asChild><h2>Customize dashboard</h2></Dialog.Title>
            <Dialog.Description asChild><p>Choose what you see on the Overview and how each card shows it. Saved for your account only.</p></Dialog.Description>
          </div>
        </div>
        <Dialog.Close asChild>
          <button type="button" className="icon-button" aria-label="Close"><X size={16} /></button>
        </Dialog.Close>
      </div>
      <div className="modal-body">
        {error && <div className="form-alert form-alert-error modal-alert" role="alert">{error}</div>}
        <fieldset className="customize-group">
          <legend>WIDGETS</legend>
          {WIDGETS.map((w) => {
            const on = widgets.includes(w);
            const mode = display[w];
            return (
              <div key={w} className="customize-widget">
                <label className="check-field">
                  <input type="checkbox" checked={on} onChange={() => setWidgets(toggle(widgets, w, WIDGETS))} />
                  <div>
                    <strong>{WIDGET_LABEL[w]}</strong>
                    <p>{mode === "numbers" ? WIDGET_HINT[w] : CHART_HINT[w][mode]}</p>
                  </div>
                </label>
                <div className="segmented" role="radiogroup" aria-label={`How to show ${WIDGET_LABEL[w]}`}>
                  {WIDGET_DISPLAYS[w].map((d) => (
                    <button
                      key={d}
                      type="button"
                      role="radio"
                      aria-checked={mode === d}
                      className={mode === d ? "active" : ""}
                      disabled={!on}
                      onClick={() => setDisplay({ ...display, [w]: d })}
                    >
                      {DISPLAY_LABEL[d]}
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
        </fieldset>
      </div>
      <div className="modal-footer">
        <Dialog.Close asChild>
          <button type="button" className="button" disabled={pending}>Cancel</button>
        </Dialog.Close>
        <button type="button" className="button button-primary" onClick={save} disabled={pending}>
          {pending ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} Save
        </button>
      </div>
    </>
  );
}
