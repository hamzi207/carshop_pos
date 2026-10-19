import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { parseDashboardPrefs, type DashboardPrefs } from "@/lib/dashboard";
import type { MoneyFormat } from "@/lib/format";
import type { ClockStyle, PrintFormat, WeekStart } from "@/lib/validations/settings.schema";

export type ShopSession = {
  userId: string;
  fullName: string;
  email: string;
  role: "admin" | "staff";
  /** This user's dashboard widgets and periods. */
  dashboardPrefs: DashboardPrefs;
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
    clockStyle: ClockStyle;
    showClock: boolean;
    clock24Hour: boolean;
    /** First day of the week: 1 Monday, 6 Saturday, 7 Sunday. */
    weekStart: WeekStart;
    /** Terms printed on quotes and invoices (tenants.quote_footer_notes). */
    quoteTerms: string | null;
    /** Printed on quotations and invoices (Settings → Your shop). */
    phone: string | null;
    email: string | null;
    address: string | null;
    ntn: string | null;
    strn: string | null;
    /** Public URL in the shop-assets bucket. */
    logoUrl: string | null;
    /** How long a quotation's offer is valid (its stock stays reserved regardless). */
    quoteValidityDays: number;
    /** Pass to formatMoney(). */
    money: MoneyFormat;
    /** A4 PDF or 80mm POS slip on the document screens. */
    printFormat: PrintFormat;
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
    .select("full_name, email, role, dashboard_prefs, tenants(id, name, slug, currency, tax_rate, timezone, show_paisa, prices_include_tax, allow_international_phones, clock_style, show_clock, clock_24_hour, week_start, print_format, quote_footer_notes, quote_validity_days, phone, email, address, ntn, strn, logo_url)")
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
    dashboardPrefs: parseDashboardPrefs(profile.dashboard_prefs),
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
      clockStyle: tenant.clock_style === "analog" ? "analog" : "digital",
      showClock: tenant.show_clock,
      clock24Hour: tenant.clock_24_hour,
      weekStart: tenant.week_start === 6 || tenant.week_start === 7 ? tenant.week_start : 1,
      quoteTerms: tenant.quote_footer_notes,
      quoteValidityDays: tenant.quote_validity_days,
      phone: tenant.phone,
      email: tenant.email,
      address: tenant.address,
      ntn: tenant.ntn,
      strn: tenant.strn,
      logoUrl: tenant.logo_url,
      money: { currency: tenant.currency, showPaisa: tenant.show_paisa },
      printFormat: tenant.print_format === "pos" ? "pos" : "a4",
    },
  };
});
