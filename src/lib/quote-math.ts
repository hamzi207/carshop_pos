// Live totals for the quote builder. Mirrors public.save_quote(), which
// works out the stored totals; keep the two in step.
//   subtotal = Σ qty × unit price (prices as entered)
//   discount = Rs. amount, or % of subtotal; spread across lines pro rata
//   tax      = tax-inclusive lines: net × r / (100 + r)  (already in the price)
//              tax-exclusive lines: net × r / 100         (added on top)
//   total    = subtotal − discount + tax on tax-exclusive lines

export type DiscountType = "amount" | "percent";

export type TotalsLine = { quantity: number; unitPrice: number; priceIncludesTax: boolean };

export type QuoteTotals = {
  subtotal: number;
  discount: number;
  /** Tax already inside tax-inclusive prices. */
  includedTax: number;
  /** Tax added on top of tax-exclusive prices. */
  addedTax: number;
  tax: number;
  total: number;
  /** The discount is larger than the subtotal (the save would be refused). */
  discountTooLarge: boolean;
};

/** Postgres round(numeric, 2): half away from zero. */
export const round2 = (n: number) => Math.sign(n) * Math.round((Math.abs(n) + Number.EPSILON) * 100) / 100;

export const lineTotal = (line: { quantity: number; unitPrice: number }) => round2(line.quantity * line.unitPrice);

export function quoteTotals(
  lines: TotalsLine[],
  { taxRate, discountType, discountValue }: { taxRate: number; discountType: DiscountType; discountValue: number },
): QuoteTotals {
  const safe = (n: number) => (Number.isFinite(n) && n > 0 ? n : 0);
  const priced = lines.map((l) => ({ gross: lineTotal({ quantity: safe(l.quantity), unitPrice: safe(l.unitPrice) }), incl: l.priceIncludesTax }));
  const subtotal = round2(priced.reduce((sum, l) => sum + l.gross, 0));

  const value = safe(discountValue);
  const rawDiscount = round2(discountType === "percent" ? (subtotal * Math.min(value, 100)) / 100 : value);
  const discountTooLarge = rawDiscount > subtotal;
  const discount = Math.min(rawDiscount, subtotal);
  const factor = subtotal > 0 ? (subtotal - discount) / subtotal : 0;

  let includedTax = 0;
  let addedTax = 0;
  for (const l of priced) {
    const net = l.gross * factor;
    if (l.incl) includedTax += (net * taxRate) / (100 + taxRate);
    else addedTax += (net * taxRate) / 100;
  }

  return {
    subtotal,
    discount,
    includedTax: round2(includedTax),
    addedTax: round2(addedTax),
    tax: round2(includedTax + addedTax),
    total: round2(subtotal - discount + addedTax),
    discountTooLarge,
  };
}
