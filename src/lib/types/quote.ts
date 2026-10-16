import type { Tables } from "./database.types";

/** A customer as the quote builder's picker shows it. */
export type CustomerOption = Pick<
  Tables<"customers">,
  | "id"
  | "name"
  | "customer_type"
  | "whatsapp_number"
  | "is_walk_in"
  | "default_discount_percentage"
  | "billing_address"
  | "credit_days"
>;

/** One row on the Drafts / Quotations / Invoices lists. */
export type DocumentListItem = Pick<
  Tables<"quotes">,
  | "id"
  | "quote_number"
  | "draft_number"
  | "quotation_number"
  | "status"
  | "total_amount"
  | "amount_paid"
  | "due_date"
  | "created_at"
  | "updated_at"
  | "quoted_at"
  | "invoiced_at"
  | "valid_until"
  | "walk_in_name"
> & {
  customer: Pick<Tables<"customers">, "id" | "name" | "customer_type" | "is_walk_in"> | null;
};

/** A saved line, plus what the builder needs to show it (SKU, stock it may use). */
export type QuoteDocumentLine = Tables<"quote_items"> & {
  sku: string | null;
  /** Units this line could use: available stock plus what the line already holds. */
  available: number | null;
};

/** One document with its customer, lines and payments, for the builder. */
export type QuoteDocument = Tables<"quotes"> & {
  customer: CustomerOption | null;
  lines: QuoteDocumentLine[];
  /** Each payment with the invoice lines it was applied to (if any). */
  payments: (Tables<"invoice_payments"> & { allocations: Tables<"invoice_payment_items">[] })[];
};

/** An inventory part offered by the line-item search (with its category's name). */
export type PickerItem = Pick<
  Tables<"inventory_items">,
  | "id"
  | "sku"
  | "name"
  | "selling_price"
  | "quantity_on_hand"
  | "reserved_quantity"
  | "low_stock_threshold"
  | "price_includes_tax"
> & { category: { name: string } | null };

/** GET /api/quote-items */
export type PickerItemsResponse = { items: PickerItem[] };

/** GET /api/customers */
export type CustomerOptionsResponse = {
  customers: CustomerOption[];
  /** The shop's walk-in / cash customer, for the quick-select button. */
  walkIn: CustomerOption | null;
};
