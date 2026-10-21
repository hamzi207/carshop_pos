import Link from "next/link";
import { BellRing, CalendarClock, Gauge, HeartPulse } from "lucide-react";
import type { Attention } from "@/lib/admin-data";
import { billingDate } from "@/lib/subscription";

/** Overview: what needs a superadmin today (follow-ups due, at-risk health, organizations near a plan limit). */
export function NeedsAttention({ data, today }: { data: Attention; today: string }) {
  const empty = !data.followUps.length && !data.atRisk.length && !data.nearLimits.length;
  return (
    <section className="card attention-card">
      <div className="card-header">
        <div>
          <h2><BellRing size={14} /> Needs attention</h2>
          <p>{empty ? "Nothing right now." : "Follow-ups due, organizations at risk, and those near a plan limit"}</p>
        </div>
      </div>
      {!empty && (
        <div className="attention-grid">
          {data.followUps.length > 0 && (
            <div>
              <h3><CalendarClock size={13} /> Follow-ups due</h3>
              <ul className="admin-list">
                {data.followUps.map((f) => (
                  <li key={f.id}>
                    <Link href={`/admin/tenants/${f.tenantId}`} className="detail-link">{f.tenantName}</Link>
                    <span className="attention-reason">{f.reason}</span>
                    <span className={f.dueOn < today ? "badge badge-red" : "badge badge-amber"}>{f.dueOn < today ? billingDate(f.dueOn) : "Today"}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {data.atRisk.length > 0 && (
            <div>
              <h3><HeartPulse size={13} /> At risk</h3>
              <ul className="admin-list">
                {data.atRisk.map((t) => (
                  <li key={t.id}>
                    <Link href={`/admin/tenants/${t.id}`} className="detail-link">{t.name}</Link>
                    <span className="badge badge-red">{t.score ?? "—"}</span>
                  </li>
                ))}
              </ul>
              <Link href="/admin/tenants?health=at_risk&sort=health" className="detail-link attention-more">All at-risk organizations</Link>
            </div>
          )}
          {data.nearLimits.length > 0 && (
            <div>
              <h3><Gauge size={13} /> Near a plan limit</h3>
              <ul className="admin-list">
                {data.nearLimits.map((n) => (
                  <li key={`${n.tenantId}-${n.kind}`}>
                    <Link href={`/admin/tenants/${n.tenantId}/subscription`} className="detail-link">{n.name}</Link>
                    <span className={n.used >= n.max ? "badge badge-red" : "badge badge-amber"}>
                      {n.used.toLocaleString("en-PK")} / {n.max.toLocaleString("en-PK")} {n.kind}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
