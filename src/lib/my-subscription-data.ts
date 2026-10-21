import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { BillingCycle, InvoiceStatus, PayTo, PaymentStatus, SubscriptionStatus } from "@/lib/subscription";

// The organization's own subscription (Phase 17, deliverable 9), from my_subscription(): its admins
// (or a superadmin acting as it) read it on /settings/subscription and /subscription-due.

export type MySubscription = {
  tenant: { id: string; name: string; status: string; statusReason: string | null };
  subscription: {
    plan: string;
    planDescription: string | null;
    cycle: BillingCycle;
    status: SubscriptionStatus;
    trialEndsAt: string | null;
    paidUntil: string | null;
    nextDueDate: string | null;
    graceDays: number;
    cancelAt: string | null;
    price: number;
    limits: { users: number | null; stores: number | null; products: number | null };
    usage: { users: number; stores: number; products: number };
  } | null;
  invoices: { id: string; number: string; periodStart: string; periodEnd: string; dueDate: string; total: number; amountPaid: number; status: InvoiceStatus }[];
  payments: { id: string; invoiceId: string; amount: number; paidOn: string; method: string; reference: string | null; status: PaymentStatus; reason: string | null; createdAt: string }[];
  payTo: PayTo;
};

/** null for anyone who isn't an active admin of an organization. */
export async function getMySubscription(): Promise<MySubscription | null> {
  const { data, error } = await (await createClient()).rpc("my_subscription");
  if (error) throw new Error(`my_subscription: ${error.message}`);
  if (!data) return null;
  const d = data as unknown as MySubscription & { payTo: Partial<PayTo> | null };
  return {
    ...d,
    subscription: d.subscription && { ...d.subscription, price: Number(d.subscription.price) },
    invoices: d.invoices.map((i) => ({ ...i, total: Number(i.total), amountPaid: Number(i.amountPaid) })),
    payments: d.payments.map((p) => ({ ...p, amount: Number(p.amount) })),
    payTo: {
      businessName: d.payTo?.businessName ?? "ProductLogik",
      wallets: d.payTo?.wallets ?? [],
      banks: d.payTo?.banks ?? [],
      note: d.payTo?.note ?? null,
    },
  };
}
