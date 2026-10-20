// Phase 16: WCAG contrast check for the ProductLogik palette (globals.css tokens, the A4 PDF and emails).
// Run: node scripts/check-contrast.mjs   — exits 1 if a text pair is below AA.
// "text" pairs need 4.5:1 (normal text); "large" (18px+ bold / 24px+) and "ui" (icons, borders) need 3:1.
import { readFileSync } from "node:fs";

const css = readFileSync(new URL("../src/app/globals.css", import.meta.url), "utf8");
const block = (start) => {
  const from = css.indexOf("{", css.indexOf(start));
  return css.slice(from, css.indexOf("}", from));
};
const light = block("\n:root");
const darkBlock = block("\n.dark {");
const find = (src, name) => src.match(new RegExp(`--${name}:\\s*(#[0-9a-fA-F]{6})`))?.[1].toLowerCase();
const token = (name) => {
  const v = find(light, name);
  if (!v) throw new Error(`token --${name} not found`);
  return v;
};
/** Dark-theme value: the .dark override, else the light value (tokens like --on-color are the same in both). */
const dark = (name) => find(darkBlock, name) ?? token(name);
const accentTs = readFileSync(new URL("../src/lib/accent.ts", import.meta.url), "utf8");
const presets = [...accentTs.matchAll(/\{ name: "([^"]+)", hex: "(#[0-9a-f]{6})" \}/g)].map((m) => [m[1], m[2]]);

function luminance(hex) {
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}
const ratio = (a, b) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};
const MIN = { text: 4.5, large: 3, ui: 3 };

const W = "#ffffff";
const pairs = [
  // App
  ["White on primary buttons / active nav", W, token("accent-brand"), "text"],
  ["Brand links on white", token("accent-brand"), W, "text"],
  ["Brand text on brand tint (tags, chips)", token("accent-brand"), token("accent-brand-soft"), "text"],
  ["Brand text on page background", token("accent-brand"), token("slate-50"), "text"],
  ["Logo emerald as a mark on white", token("accent-brand-bright"), W, "ui"],
  ["Body text on white", token("slate-900"), W, "text"],
  ["Muted text on white", token("slate-500"), W, "text"],
  ["Muted text on page background", token("slate-500"), token("slate-50"), "text"],
  ["Sidebar text", token("slate-300"), token("slate-950"), "text"],
  ["Sidebar small text", token("slate-400"), token("slate-950"), "text"],
  ["Sidebar wordmark / help (emerald 300)", "#6ee7b7", token("slate-950"), "text"],
  ["Success badge (paid)", token("green-dark"), token("green-soft"), "text"],
  ["Success icon on tint", token("green"), token("green-soft"), "ui"],
  ["Danger text on white", "#e11d48", W, "text"],
  ["Info text on tint", token("info-dark"), token("info-soft"), "text"],
  // A4 PDF + emails (document-pdf.tsx, email/templates/layout.ts)
  ["PDF / email body text", "#0f172a", W, "text"],
  ["PDF / email muted text", "#64748b", W, "text"],
  ["PDF muted text on shaded rows", "#64748b", "#f8fafc", "text"],
  ["PDF balance due", "#be123c", W, "text"],
  ["PDF paid amounts", "#0f766e", W, "text"],
  // Dark theme (RF-16.4): --white is the card surface, --slate-50 the page
  ["Dark: body text on cards", dark("slate-900"), dark("white"), "text"],
  ["Dark: muted text on cards", dark("slate-500"), dark("white"), "text"],
  ["Dark: muted text on page", dark("slate-500"), dark("slate-50"), "text"],
  ["Dark: secondary text (slate-400) on cards", dark("slate-400"), dark("white"), "text"],
  ["Dark: secondary text (slate-600) on cards", dark("slate-600"), dark("white"), "text"],
  ["Dark: brand text on cards", dark("accent-brand-text"), dark("white"), "text"],
  ["Dark: brand text on brand tint", dark("accent-brand-text"), dark("accent-brand-soft"), "text"],
  ["Dark: white on brand fills", dark("on-color"), dark("accent-brand"), "text"],
  ["Dark: primary (light) button text", dark("white"), dark("slate-950"), "text"],
  ["Dark: success badge", dark("green-dark"), dark("green-soft"), "text"],
  ["Dark: danger text on cards", dark("danger-text"), dark("white"), "text"],
  ["Dark: danger text on danger tint", dark("danger-text"), dark("red-soft"), "text"],
  ["Dark: warning text on warning tint", dark("warning-text"), dark("amber-soft"), "text"],
  ["Dark: info text on info tint", dark("info-dark"), dark("info-soft"), "text"],
  ["Dark: shadcn destructive text on popovers", dark("destructive"), dark("white"), "text"],
  ["Dark: input borders on cards", dark("slate-300"), dark("white"), "ui"],
  ["Both: white on success buttons", token("on-color"), token("success-bg"), "text"],
  ["Both: white on danger buttons / badges", token("on-color"), token("danger-bg"), "text"],
  ["Light: danger text on danger tint", token("danger-text"), token("red-soft"), "text"],
  ["Light: warning text on warning tint", token("warning-text"), token("amber-soft"), "text"],
  // RF-16.1 document colour presets: text on white and white text on them
  ...presets.map(([name, hex]) => [`Document colour preset ${name}`, hex, W, "text"]),
];

let failed = 0;
for (const [label, fg, bg, kind] of pairs) {
  const r = ratio(fg, bg);
  const ok = r >= MIN[kind];
  if (!ok) failed++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${r.toFixed(2).padStart(5)}:1  (${kind} ≥ ${MIN[kind]})  ${fg} on ${bg}  ${label}`);
}
console.log(failed ? `\n${failed} pair(s) below WCAG AA` : `\nAll ${pairs.length} pairs pass WCAG AA`);
process.exit(failed ? 1 : 0);
