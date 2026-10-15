import type { Tables } from "./database.types";

/** A customer row with quote activity, as the directory table shows it. */
export type CustomerListItem = Tables<"customers"> & {
  /** Quotes and invoices, excluding cancelled ones. */
  quoteCount: number;
  /** Sum of invoices that are issued but not yet paid. */
  outstanding: number;
};

export type CustomerQuote = {
  id: string;
  quote_number: string;
  status: string;
  total_amount: number;
  created_at: string;
  custom_vehicle_notes: string | null;
  vehicle: { year: number; make: string; model: string; trim: string | null } | null;
};

export type CustomerDetail = Tables<"customers"> & {
  quotes: CustomerQuote[];
  outstanding: number;
};
