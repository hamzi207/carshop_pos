"use client";

import { useState, type MouseEvent, type ReactNode } from "react";

// Small SVG charts for the dashboard cards. Colours are validated categorical
// slots (dataviz reference palette, light mode): blue, orange, aqua. Aqua is
// under 3:1 against white, so every chart carries visible labels / a legend
// with values ("relief rule"), and identity is never colour alone.
export const SERIES = ["#2a78d6", "#eb6834", "#1baf7a"] as const;
const SINGLE = SERIES[0];

type Tip = { x: number; y: number; content: ReactNode } | null;

function useTooltip() {
  const [tip, setTip] = useState<Tip>(null);
  const show = (e: MouseEvent, content: ReactNode) => {
    const box = (e.currentTarget as Element).closest(".chart")!.getBoundingClientRect();
    setTip({ x: e.clientX - box.left, y: e.clientY - box.top, content });
  };
  const node = tip && (
    <div className="chart-tip" style={{ left: tip.x, top: tip.y }} role="tooltip">
      {tip.content}
    </div>
  );
  return { show, hide: () => setTip(null), node };
}

type Bar = { label: string; value: number; detail?: string };

/** One series of columns (magnitude): one hue, 4px rounded tops, recessive grid. */
export function BarChart({ bars, format, title }: { bars: Bar[]; format: (n: number) => string; title: string }) {
  const { show, hide, node } = useTooltip();
  const max = Math.max(...bars.map((b) => b.value), 0);
  if (max <= 0) return <p className="chart-empty">Nothing to show yet.</p>;

  const W = 320;
  const H = 150;
  const top = 18;
  const base = H - 22;
  const slot = W / bars.length;
  const width = Math.min(34, slot * 0.56);
  const peak = bars.reduce((best, b, i) => (b.value > bars[best].value ? i : best), 0);
  // Long series (daily bars across a month): label every few columns so they don't collide.
  const labelEvery = Math.ceil(bars.length / 8);

  return (
    <div className="chart">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${title}: ${bars.map((b) => `${b.label} ${format(b.value)}`).join(", ")}`}>
        {[0.5, 1].map((f) => (
          <line key={f} className="chart-grid" x1="0" x2={W} y1={base - (base - top) * f} y2={base - (base - top) * f} />
        ))}
        <line className="chart-axis" x1="0" x2={W} y1={base} y2={base} />
        {bars.map((b, i) => {
          const h = b.value > 0 ? Math.max(2, ((base - top) * b.value) / max) : 0;
          const x = i * slot + (slot - width) / 2;
          const y = base - h;
          const r = Math.min(4, h, width / 2);
          return (
            <g key={b.label}>
              {/* Hit target: the whole column slot, bigger than the mark. */}
              <rect
                className="chart-hit"
                x={i * slot}
                y={top - 10}
                width={slot}
                height={base - top + 10}
                onMouseMove={(e) => show(e, <><strong>{b.label}</strong><span>{format(b.value)}</span>{b.detail && <span>{b.detail}</span>}</>)}
                onMouseLeave={hide}
              />
              {h > 0 && (
                <path
                  className="chart-bar"
                  fill={SINGLE}
                  d={`M${x},${base} V${y + r} Q${x},${y} ${x + r},${y} H${x + width - r} Q${x + width},${y} ${x + width},${y + r} V${base} Z`}
                />
              )}
              {/* Selective direct label: only the tallest column. */}
              {i === peak && <text className="chart-value" x={x + width / 2} y={y - 5}>{format(b.value)}</text>}
              {i % labelEvery === 0 && <text className="chart-label" x={i * slot + slot / 2} y={H - 6}>{b.label}</text>}
            </g>
          );
        })}
      </svg>
      {node}
    </div>
  );
}

type Slice = { label: string; value: number; detail?: string };

/** Part-to-whole (≤ 3 slices here): donut with 2px surface gaps and a legend carrying the values. */
export function DonutChart({ slices, format, title, centre }: { slices: Slice[]; format: (n: number) => string; title: string; centre?: string }) {
  const { show, hide, node } = useTooltip();
  const parts = slices.map((s) => ({ ...s, value: Math.max(s.value, 0) }));
  const total = parts.reduce((sum, s) => sum + s.value, 0);
  if (total <= 0) return <p className="chart-empty">Nothing to show yet.</p>;

  const R = 52;
  const r = 34;
  const sweeps = parts.map((s) => (s.value / total) * Math.PI * 2);
  const arcs = parts.map((s, i) => {
    const sweep = sweeps[i];
    const a0 = -Math.PI / 2 + sweeps.slice(0, i).reduce((sum, v) => sum + v, 0);
    const a1 = a0 + sweep;
    if (s.value <= 0) return null;
    // A full circle can't be drawn as a single arc path: use a ring instead.
    if (sweep >= Math.PI * 2 - 1e-6) {
      return <g key={s.label}><circle cx="60" cy="60" r={(R + r) / 2} fill="none" stroke={SERIES[i]} strokeWidth={R - r} /></g>;
    }
    const large = sweep > Math.PI ? 1 : 0;
    const p = (a: number, rad: number) => `${60 + rad * Math.cos(a)},${60 + rad * Math.sin(a)}`;
    const d = `M${p(a0, R)} A${R},${R} 0 ${large} 1 ${p(a1, R)} L${p(a1, r)} A${r},${r} 0 ${large} 0 ${p(a0, r)} Z`;
    const pct = Math.round((s.value / total) * 100);
    return (
      <path
        key={s.label}
        className="chart-slice"
        d={d}
        fill={SERIES[i]}
        onMouseMove={(e) => show(e, <><strong>{s.label}</strong><span>{format(s.value)} · {pct}%</span>{s.detail && <span>{s.detail}</span>}</>)}
        onMouseLeave={hide}
      />
    );
  });

  return (
    <div className="chart chart-donut">
      <svg viewBox="0 0 120 120" role="img" aria-label={`${title}: ${parts.map((s) => `${s.label} ${format(s.value)}`).join(", ")}`}>
        {arcs}
        {centre && <text className="chart-centre" x="60" y="64">{centre}</text>}
      </svg>
      <ul className="chart-legend">
        {parts.map((s, i) => (
          <li key={s.label}>
            <span className="chart-swatch" style={{ background: SERIES[i] }} aria-hidden="true" />
            <span>{s.label}</span>
            <strong>{format(s.value)}</strong>
            <small>{Math.round((s.value / total) * 100)}%</small>
          </li>
        ))}
      </ul>
      {node}
    </div>
  );
}
