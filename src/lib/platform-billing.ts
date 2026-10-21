import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import type { PayTo } from "@/lib/subscription";

// The business that bills organizations and where they pay (Platform settings, Phase 17 deliverable 5).
// Printed on subscription invoices, emails and the organization's Subscription page.

export type PlatformBilling = {
  seller: { name: string; address: string | null; phone: string | null; email: string | null; ntn: string | null };
  payTo: PayTo;
};

export async function getPlatformBilling(): Promise<PlatformBilling> {
  const { data } = await createAdminClient()
    .from("platform_settings")
    .select("business_name, business_address, business_phone, business_email, business_ntn, payment_wallets, payment_banks, payment_note")
    .maybeSingle();
  const name = data?.business_name ?? "ProductLogik";
  return {
    seller: {
      name,
      address: data?.business_address ?? null,
      phone: data?.business_phone ?? null,
      email: data?.business_email ?? null,
      ntn: data?.business_ntn ?? null,
    },
    payTo: {
      businessName: name,
      wallets: Array.isArray(data?.payment_wallets) ? (data.payment_wallets as PayTo["wallets"]) : [],
      banks: Array.isArray(data?.payment_banks) ? (data.payment_banks as PayTo["banks"]) : [],
      note: data?.payment_note ?? null,
    },
  };
}
