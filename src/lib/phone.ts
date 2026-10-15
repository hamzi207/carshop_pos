// Phone number rules (PROJECT_SPEC.md §2.3).
// Pakistani numbers are entered in local format ("0300-1234567") and always
// accepted. International "+country code" numbers are accepted only when the
// shop allows them. Everything is stored in E.164 ("+923001234567") so
// WhatsApp links work for every client.

export type PhoneKind = "mobile" | "landline" | "international";

export type PhoneParseResult =
  | { ok: true; e164: string; kind: PhoneKind }
  | { ok: false; error: string };

const PK_MOBILE = /^03\d{9}$/; // 0300-1234567
const PK_LANDLINE = /^0[1-24-9]\d{8,9}$/; // 051-1234567, 042-35123456
const E164 = /^\+[1-9]\d{7,14}$/;

export const PHONE_EXAMPLE = "0300-1234567";

/** Parses what a user typed. Spaces, dashes, dots and brackets are ignored. */
export function parsePhone(input: string, allowInternational: boolean): PhoneParseResult {
  let n = input.trim().replace(/[\s\-().]/g, "");
  if (!n) return { ok: false, error: "Enter a phone number." };
  if (!/^\+?\d+$/.test(n)) return { ok: false, error: "Use digits only (spaces and dashes are fine)." };

  // Pakistani country code in any form → local "0" format.
  if (n.startsWith("+92")) n = `0${n.slice(3)}`;
  else if (n.startsWith("0092")) n = `0${n.slice(4)}`;
  else if (n.startsWith("92") && n.length === 12) n = `0${n.slice(2)}`;
  // A mobile typed without its leading 0 ("3001234567").
  else if (/^3\d{9}$/.test(n)) n = `0${n}`;

  if (n.startsWith("+") || n.startsWith("00")) {
    const intl = n.startsWith("00") ? `+${n.slice(2)}` : n;
    if (!allowInternational) {
      return {
        ok: false,
        error: `Enter a Pakistani number starting with 0 (e.g. ${PHONE_EXAMPLE}). International numbers can be switched on in Settings.`,
      };
    }
    if (!E164.test(intl)) return { ok: false, error: "Enter the full international number, e.g. +971501234567." };
    return { ok: true, e164: intl, kind: "international" };
  }

  if (PK_MOBILE.test(n)) return { ok: true, e164: `+92${n.slice(1)}`, kind: "mobile" };
  if (PK_LANDLINE.test(n)) return { ok: true, e164: `+92${n.slice(1)}`, kind: "landline" };
  return { ok: false, error: `Enter a Pakistani number starting with 0, e.g. ${PHONE_EXAMPLE}.` };
}

/** "+923001234567" → "0300-1234567"; international numbers are shown as stored. */
export function formatPhone(e164: string | null | undefined) {
  if (!e164) return "";
  if (!e164.startsWith("+92")) return e164;
  const local = `0${e164.slice(3)}`;
  if (PK_MOBILE.test(local)) return `${local.slice(0, 4)}-${local.slice(4)}`;
  return `${local.slice(0, 3)}-${local.slice(3)}`;
}

/** wa.me click-to-chat link, optionally with a pre-filled message. */
export function whatsappLink(e164: string, message?: string) {
  const base = `https://wa.me/${e164.replace(/^\+/, "")}`;
  return message ? `${base}?text=${encodeURIComponent(message)}` : base;
}
