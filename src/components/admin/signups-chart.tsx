"use client";

import { BarChart } from "@/components/dashboard/charts";

const MONTH = new Intl.DateTimeFormat("en-GB", { month: "short", timeZone: "UTC" });

/** New shops per month (reuses the dashboard's bar chart). */
export function SignupsChart({ signups }: { signups: { month: string; count: number }[] }) {
  const bars = signups.map((s) => ({
    label: MONTH.format(new Date(`${s.month}-01T00:00:00Z`)),
    value: s.count,
    detail: `${s.month}: ${s.count} ${s.count === 1 ? "shop" : "shops"}`,
  }));
  return <BarChart bars={bars} format={(n) => String(n)} title="New organizations per month" />;
}
