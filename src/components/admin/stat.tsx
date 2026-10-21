import type { ReactNode } from "react";

/** One figure on the console's Overview and Billing pages. */
export function Stat({ tone, icon, title, value, detail }: { tone: string; icon: ReactNode; title: string; value: string; detail: string }) {
  return (
    <section className={`card stat-card ${tone}`}>
      <div className="stat-head">
        <span className={`metric-icon ${tone}`}>{icon}</span>
        <h3>{title}</h3>
      </div>
      <strong>{value}</strong>
      <span>{detail}</span>
    </section>
  );
}
