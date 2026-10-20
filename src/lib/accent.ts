// RF-16.1: an organization's own accent colour on its documents (A4 PDF, share page, emails).
// The app itself stays ProductLogik emerald; the POS slip stays black (thermal printers).

/** ProductLogik emerald 700: what documents use when the organization hasn't picked a colour. */
export const DEFAULT_ACCENT = "#047857";

/** Accents must read as text on white paper and carry white text (WCAG AA for normal text). */
export const MIN_ACCENT_CONTRAST = 4.5;

/** Presets offered next to the picker; each passes MIN_ACCENT_CONTRAST. */
export const ACCENT_PRESETS = [
  { name: "Emerald", hex: "#047857" },
  { name: "Teal", hex: "#0f766e" },
  { name: "Blue", hex: "#1d4ed8" },
  { name: "Indigo", hex: "#4338ca" },
  { name: "Purple", hex: "#7e22ce" },
  { name: "Red", hex: "#b91c1c" },
  { name: "Orange", hex: "#c2410c" },
  { name: "Slate", hex: "#334155" },
] as const;

export const HEX_COLOR = /^#[0-9a-f]{6}$/;

function luminance(hex: string) {
  const channel = (i: number) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(1) + 0.7152 * channel(3) + 0.0722 * channel(5);
}

/** WCAG contrast ratio between two #rrggbb colours (1 to 21). */
export function contrastRatio(a: string, b: string) {
  const [hi, lo] = [luminance(a.toLowerCase()), luminance(b.toLowerCase())].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

export const isReadableAccent = (hex: string) => HEX_COLOR.test(hex) && contrastRatio(hex, "#ffffff") >= MIN_ACCENT_CONTRAST;

/** The colour a document should use: the organization's own if set and readable, else the default. */
export const documentAccent = (hex: string | null | undefined) => (hex && isReadableAccent(hex) ? hex : DEFAULT_ACCENT);

/** `hex` mixed with white, e.g. a pale background tint behind accent text (0 = white, 1 = hex). */
export function tint(hex: string, amount: number) {
  const mix = (i: number) => Math.round(255 + (parseInt(hex.slice(i, i + 2), 16) - 255) * amount).toString(16).padStart(2, "0");
  return `#${mix(1)}${mix(3)}${mix(5)}`;
}
