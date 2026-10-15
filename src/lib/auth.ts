import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { MoneyFormat } from "@/lib/format";

export type ShopSession = {
  userId: string;
  fullName: string;
  email: string;
  role: "admin" | "staff";
  tenant: {
    id: string;
    name: string;
    slug: string;
    currency: string;
    taxRate: number;
    timezone: string;
    showPaisa: boolean;
    pricesIncludeTax: boolean;
    allowInternationalPhones: boolean;
    /** Pass to formatMoney(). */
    money: MoneyFormat;
  };
};

/**
 * Data Access Layer: the signed-in user's profile and shop.
 * Reads the request cookies, so callers must render inside <Suspense>.
 * Deduplicated per request via React cache().
 */
export const getShopSession = cache(async (): Promise<ShopSession> => {
  const supabase = await createClient();

  const { data: claimsData } = await supabase.auth.getClaims();
  const userId = claimsData?.claims?.sub;
  if (!userId) redirect("/login");

  // RLS limits this to the caller's own profile/tenant.
  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, email, role, tenants(id, name, slug, currency, tax_rate, timezone, show_paisa, prices_include_tax, allow_international_phones)")
    .eq("id", userId)
    .single();

  const tenant = profile?.tenants;
  if (!profile || !tenant) {
    // Signed in but not attached to any shop: shouldn't happen after registration.
    redirect("/login?error=no_shop");
  }

  return {
    userId,
    fullName: profile.full_name,
    email: profile.email,
    // DB check constraint limits role to admin|staff; fail closed to staff.
    role: profile.role === "admin" ? "admin" : "staff",
    tenant: {
      id: tenant.id,
      name: tenant.name,
      slug: tenant.slug,
      currency: tenant.currency,
      taxRate: Number(tenant.tax_rate),
      timezone: tenant.timezone,
      showPaisa: tenant.show_paisa,
      pricesIncludeTax: tenant.prices_include_tax,
      allowInternationalPhones: tenant.allow_international_phones,
      money: { currency: tenant.currency, showPaisa: tenant.show_paisa },
    },
  };
});
