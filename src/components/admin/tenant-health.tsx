import type { ReactNode } from "react";
import { Check, HeartPulse, X } from "lucide-react";
import type { Health } from "@/lib/tenant-overview-data";
import { adminDate } from "./format";

// RF-17.4: the organization health score. Healthy ≥ 70, Watch ≥ 40, else At risk.

const BAND = {
  healthy: { label: "Healthy", tone: "badge badge-green" },
  watch: { label: "Watch", tone: "badge badge-amber" },
  at_risk: { label: "At risk", tone: "badge badge-red" },
} as const;

const bandOf = (band: string | null) => (band && band in BAND ? BAND[band as keyof typeof BAND] : null);

/** "72 · Healthy" (the list shows the daily snapshot; "—" before the first one). */
export function HealthBadge({ score, band }: { score: number | null; band: string | null }) {
  const b = bandOf(band);
  if (score === null || !b) return <span className="admin-muted">—</span>;
  return <span className={b.tone}>{score} · {b.label}</span>;
}

function Trend({ points }: { points: { date: string; score: number }[] }) {
  if (points.length < 2) return <p className="admin-muted health-trend-empty">The trend appears after a few daily runs.</p>;
  const w = 240;
  const h = 48;
  const x = (i: number) => (i / (points.length - 1)) * w;
  const y = (s: number) => h - (s / 100) * h;
  const d = points.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(p.score).toFixed(1)}`).join(" ");
  const last = points[points.length - 1]!;
  return (
    <figure className="health-trend">
      <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" role="img" aria-label={`Health from ${points[0]!.score} to ${last.score} over ${points.length} days`}>
        <line x1="0" x2={w} y1={y(70)} y2={y(70)} className="health-trend-guide" />
        <line x1="0" x2={w} y1={y(40)} y2={y(40)} className="health-trend-guide" />
        <path d={d} className="health-trend-line" vectorEffect="non-scaling-stroke" />
      </svg>
      <figcaption>{adminDate(points[0]!.date)} – {adminDate(last.date)}</figcaption>
    </figure>
  );
}

const Item = ({ ok, children }: { ok: boolean; children: ReactNode }) => (
  <li className={ok ? "is-ok" : undefined}>{ok ? <Check size={12} /> : <X size={12} />} {children}</li>
);

/** Overview tab: today's live score, what makes it up, and the daily trend. */
export function HealthCard({ health, trend }: { health: Health | null; trend: { date: string; score: number }[] }) {
  const b = health ? bandOf(health.band) : null;
  return (
    <section className="card admin-section">
      <div className="card-header">
        <div>
          <h2><HeartPulse size={16} /> Health</h2>
          <p>From the last 30 days: sign-ins, documents and setup.</p>
        </div>
        {health && b && <span className={`${b.tone} health-score`}>{health.score} · {b.label}</span>}
      </div>
      {!health ? (
        <p className="admin-muted health-body">Archived organizations have no score.</p>
      ) : (
        <div className="health-body">
          <div className="health-parts">
            <div>
              <strong>{health.parts.signIns.points}/{health.parts.signIns.of}</strong>
              <span>Sign-ins: {health.parts.signIns.signedIn} of {health.parts.signIns.activeUsers} active users</span>
            </div>
            <div>
              <strong>{health.parts.activity.points}/{health.parts.activity.of}</strong>
              <span>Activity: {health.parts.activity.documents30d} documents (full marks at 5 a week)</span>
            </div>
            <div>
              <strong>{health.parts.setup.points}/{health.parts.setup.of}</strong>
              <span>Setup</span>
              <ul className="health-setup">
                <Item ok={health.parts.setup.profile}>Phone & address</Item>
                <Item ok={health.parts.setup.logo}>Logo</Item>
                <Item ok={health.parts.setup.product}>A product</Item>
                <Item ok={health.parts.setup.customer}>A customer</Item>
                <Item ok={health.parts.setup.invoice}>An invoice</Item>
              </ul>
            </div>
          </div>
          <Trend points={trend} />
        </div>
      )}
    </section>
  );
}
