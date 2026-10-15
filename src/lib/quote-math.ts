// Live totals for the quote builder. Mirrors public.save_quote(), which
// works out the stored totals; keep the two in step.
//   Lines:     discount is per unit (% of the unit price, or a flat amount)
//              sale price = unit price − discount; line total = qty × sale price
//   Document:  subtotal  = Σ line totals
//              taxable   = subtotal − document discount (Rs. or % of subtotal)
//              tax       = tax-exclusive lines: their share of taxable × r / 100      (added on top)
//                          tax-inclusive lines: their share of taxable × r / (100 + r) (already inside)
//              total     = taxable + tax added on top

export type DiscountType = "amount" | "percent";

export type TotalsLine = {
  quantity: number;
  unitPrice: number;
  priceIncludesTax: boolean;
  discountType: DiscountType;
  discountValue: number;
};

export type QuoteTotals = {
  /** Σ line discounts (qty × per-unit discount). */
  lineDiscounts: number;
  /** Σ line totals. */
  subtotal: number;
  /** Document-level discount in rupees. */
  discount: number;
  /** subtotal − document discount. */
  taxable: number;
  /** Tax already inside tax-inclusive prices. */
  includedTax: number;
  /** Tax added on top of tax-exclusive prices. */
  addedTax: number;
  tax: number;
  total: number;
  /** The document discount is larger than the subtotal (the save would be refused). */
  discountTooLarge: boolean;
};

/** Postgres round(numeric, 2): half away from zero. */
export const round2 = (n: number) => Math.sign(n) * Math.round((Math.abs(n) + Number.EPSILON) * 100) / 100;

const safe = (n: number) => (Number.isFinite(n) && n > 0 ? n : 0);

/** Per-unit discount in rupees, as entered (may exceed the unit price; see `invalid`). */
export function unitDiscount(line: Pick<TotalsLine, "unitPrice" | "discountType" | "discountValue">) {
  const unit = safe(line.unitPrice);
  const value = Number.isFinite(line.discountValue) ? line.discountValue : 0;
  return round2(line.discountType === "amount" ? value : (unit * value) / 100);
}

/** One line's amounts, as save_quote stores them. */
export function lineAmounts(line: Omit<TotalsLine, "priceIncludesTax">) {
  const unit = safe(line.unitPrice);
  const raw = unitDiscount(line);
  const invalid = raw < 0 || raw > unit || (line.discountType === "percent" && line.discountValue > 100);
  const discount = Math.min(Math.max(raw, 0), unit);
  const salePrice = round2(unit - discount);
  const gross = round2(safe(line.quantity) * unit);
  const net = round2(safe(line.quantity) * salePrice);
  return { salePrice, gross, net, lineDiscount: round2(gross - net), invalid };
}

export function quoteTotals(
  lines: TotalsLine[],
  { taxRate, discountType, discountValue }: { taxRate: number; discountType: DiscountType; discountValue: number },
): QuoteTotals {
  const priced = lines.map((l) => ({ ...lineAmounts(l), incl: l.priceIncludesTax }));
  const lineDiscounts = round2(priced.reduce((sum, l) => sum + l.lineDiscount, 0));
  const subtotal = round2(priced.reduce((sum, l) => sum + l.net, 0));

  const value = safe(discountValue);
  const rawDiscount = round2(discountType === "percent" ? (subtotal * Math.min(value, 100)) / 100 : value);
  const discountTooLarge = rawDiscount > subtotal;
  const discount = Math.min(rawDiscount, subtotal);
  const taxable = round2(subtotal - discount);
  const factor = subtotal > 0 ? taxable / subtotal : 0;

  let includedTax = 0;
  let addedTax = 0;
  for (const l of priced) {
    const share = l.net * factor;
    if (l.incl) includedTax += (share * taxRate) / (100 + taxRate);
    else addedTax += (share * taxRate) / 100;
  }

  return {
    lineDiscounts,
    subtotal,
    discount,
    taxable,
    includedTax: round2(includedTax),
    addedTax: round2(addedTax),
    tax: round2(includedTax + addedTax),
    total: round2(taxable + addedTax),
    discountTooLarge,
  };
}
