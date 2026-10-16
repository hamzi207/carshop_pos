"use client";

import { BarChart } from "@/components/dashboard/charts";
import { formatMoney, type MoneyFormat } from "@/lib/format";

const fmtDay = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
const fmtMonth = new Intl.DateTimeFormat("en-GB", { month: "short", year: "2-digit", timeZone: "UTC" });

/** Sales per day / month / year across the report's dates. */
export function SalesChart({ series, grain, money }: { series: { start: string; sales: number }[]; grain: "day" | "month" | "year"; money: MoneyFormat }) {
  const label = (iso: string) => {
    const d = new Date(`${iso}T00:00:00Z`);
    return grain === "day" ? fmtDay.format(d) : grain === "month" ? fmtMonth.format(d) : String(d.getUTCFullYear());
  };
  return (
    <BarChart
      title={`Sales by ${grain}`}
      format={(n) => formatMoney(n, money)}
      bars={series.map((s) => ({ label: label(s.start), value: Math.max(Number(s.sales), 0) }))}
    />
  );
}
