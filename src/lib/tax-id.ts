// Pakistani tax identity numbers (FBR), stored normalised:
//   CNIC  12345-1234567-1   (13 digits)
//   NTN   1234567-8         (7 digits + check digit; older NTNs: 1234567)
//   STRN  3277876123456     (13 digits, shown as 32-77-8761-234-56)
// Mirrors the customers_cnic_or_ntn_format_check / customers_strn_format_check constraints.

type Parsed = { ok: true; value: string } | { ok: false; error: string };

const digitsOf = (input: string) => input.replace(/[\s-]/g, "");

export function parseCnicOrNtn(input: string): Parsed {
  const d = digitsOf(input);
  if (!/^\d+$/.test(d)) return { ok: false, error: "Use digits and dashes only." };
  if (d.length === 13) return { ok: true, value: `${d.slice(0, 5)}-${d.slice(5, 12)}-${d.slice(12)}` };
  if (d.length === 8) return { ok: true, value: `${d.slice(0, 7)}-${d.slice(7)}` };
  if (d.length === 7) return { ok: true, value: d };
  return { ok: false, error: "Enter a 13-digit CNIC (12345-1234567-1) or a 7–8 digit NTN (1234567-8)." };
}

export function parseStrn(input: string): Parsed {
  const d = digitsOf(input);
  if (!/^\d{13}$/.test(d)) return { ok: false, error: "An STRN has 13 digits, e.g. 32-77-8761-234-56." };
  return { ok: true, value: d };
}

export function formatStrn(strn: string | null) {
  if (!strn) return "";
  return strn.length === 13
    ? `${strn.slice(0, 2)}-${strn.slice(2, 4)}-${strn.slice(4, 8)}-${strn.slice(8, 11)}-${strn.slice(11)}`
    : strn;
}

/** "CNIC" or "NTN", from a stored value. */
export const taxIdKind = (value: string) => (value.length === 15 ? "CNIC" : "NTN");
