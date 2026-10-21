"use client";

import { useState, useTransition } from "react";
import { Loader2, Megaphone, Send, X } from "lucide-react";
import { createAnnouncement, endAnnouncement } from "@/lib/actions/platform";
import { notify } from "@/lib/notify";
import type { AnnouncementRow } from "@/lib/platform-data";
import { adminDateTime } from "./format";

const STATE = {
  live: { label: "Live", tone: "badge badge-green" },
  scheduled: { label: "Scheduled", tone: "badge badge-blue" },
  ended: { label: "Ended", tone: "badge badge-muted" },
} as const;

const EMPTY = { message: "", tone: "info" as "info" | "warning", startsAt: "", endsAt: "", tenantIds: [] as string[] };

/** /admin/platform: a banner for every organization or chosen ones, now or scheduled (e.g. maintenance). */
export function AnnouncementManager({ rows, tenants }: { rows: AnnouncementRow[]; tenants: { id: string; name: string }[] }) {
  const [v, setV] = useState(EMPTY);
  const [everyone, setEveryone] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const post = () =>
    startTransition(async () => {
      setError(null);
      if (!everyone && v.tenantIds.length === 0) {
        setError("Choose at least one organization, or show it to everyone.");
        return;
      }
      const result = await createAnnouncement({ ...v, tenantIds: everyone ? [] : v.tenantIds });
      if (result.status === "error") setError(result.message);
      else {
        notify.success("Announcement posted", result.message);
        setV(EMPTY);
        setEveryone(true);
      }
    });

  const end = (id: string) =>
    startTransition(async () => {
      const result = await endAnnouncement(id);
      if (result.status === "error") notify.error("Not ended", result.message);
      else notify.success("Announcement ended");
    });

  return (
    <section className="card settings-card">
      <div className="settings-card-head">
        <span className="header-icon blue"><Megaphone size={18} /></span>
        <div>
          <h2>Announcements</h2>
          <p>A banner at the top of the app for organizations&apos; users, e.g. planned maintenance. Users can hide it for themselves.</p>
        </div>
      </div>

      <form
        className="announce-form"
        onSubmit={(e) => {
          e.preventDefault();
          post();
        }}
      >
        <textarea className="settings-input" rows={2} maxLength={500} placeholder="Message" aria-label="Message" value={v.message} onChange={(e) => setV({ ...v, message: e.target.value })} />
        <div className="announce-options">
          <label>
            <span>Style</span>
            <select className="settings-input" value={v.tone} onChange={(e) => setV({ ...v, tone: e.target.value as "info" | "warning" })}>
              <option value="info">Information</option>
              <option value="warning">Warning</option>
            </select>
          </label>
          <label>
            <span>From (Pakistan time)</span>
            <input className="settings-input" type="datetime-local" value={v.startsAt} onChange={(e) => setV({ ...v, startsAt: e.target.value })} />
          </label>
          <label>
            <span>Until</span>
            <input className="settings-input" type="datetime-local" value={v.endsAt} onChange={(e) => setV({ ...v, endsAt: e.target.value })} />
          </label>
          <label className="announce-everyone">
            <input type="checkbox" className="switch" checked={everyone} onChange={(e) => setEveryone(e.target.checked)} />
            <span>Every organization</span>
          </label>
        </div>
        {!everyone && (
          <select
            className="settings-input announce-targets"
            multiple
            aria-label="Organizations"
            value={v.tenantIds}
            onChange={(e) => setV({ ...v, tenantIds: Array.from(e.target.selectedOptions, (o) => o.value) })}
          >
            {tenants.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        )}
        {error && <div className="form-alert form-alert-error" role="alert">{error}</div>}
        <div className="announce-actions">
          <small>{v.startsAt ? "" : "Starts now. "}{v.endsAt ? "" : "Stays until you end it."}</small>
          <button type="submit" className="button button-primary" disabled={pending || !v.message.trim()}>
            {pending ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />} Post Announcement
          </button>
        </div>
      </form>

      {rows.length > 0 && (
        <ul className="announce-list">
          {rows.map((a) => (
            <li key={a.id} className={a.state === "ended" ? "is-ended" : undefined}>
              <div>
                <span className={STATE[a.state].tone}>{STATE[a.state].label}</span>
                {a.tone === "warning" && <span className="badge badge-amber">Warning</span>}
                <p>{a.message}</p>
                <small>
                  {a.targets ? a.targets.map((t) => t.name).join(", ") : "Every organization"} · {adminDateTime(a.startsAt)}
                  {a.endsAt ? ` – ${adminDateTime(a.endsAt)}` : " onwards"} · by {a.by}
                </small>
              </div>
              {a.state !== "ended" && (
                <button type="button" className="button" disabled={pending} onClick={() => end(a.id)}><X size={14} /> End</button>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
