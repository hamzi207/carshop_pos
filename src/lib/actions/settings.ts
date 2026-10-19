"use server";

import { refresh } from "next/cache";
import { getShopSession } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { parsePhone } from "@/lib/phone";
import { SUPABASE_URL } from "@/lib/supabase/env";
import {
  shopProfileSchema,
  shopSettingsSchema,
  type ShopProfileValues,
  type ShopSettingsInput,
} from "@/lib/validations/settings.schema";

export type SettingsActionResult = { status: "success" } | { status: "error"; message: string };

/** Admin-only (also enforced by the "Admins can update their own tenant" RLS policy). */
export async function updateShopSettings(input: ShopSettingsInput): Promise<SettingsActionResult> {
  const parsed = shopSettingsSchema.safeParse(input);
  if (!parsed.success) {
    return { status: "error", message: parsed.error.issues[0]?.message ?? "Check the settings." };
  }

  const session = await getShopSession();
  if (session.role !== "admin") {
    return { status: "error", message: "Only shop admins can change settings." };
  }

  const s = parsed.data;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("tenants")
    .update({
      currency: s.currency,
      show_paisa: s.showPaisa,
      tax_rate: Math.round(s.taxRate * 100) / 100,
      prices_include_tax: s.pricesIncludeTax,
      allow_international_phones: s.allowInternationalPhones,
      timezone: s.timezone,
      show_clock: s.showClock,
      clock_style: s.clockStyle,
      clock_24_hour: s.clock24Hour,
      week_start: s.weekStart,
      quote_validity_days: s.quoteValidityDays,
      print_format: s.printFormat,
      updated_at: new Date().toISOString(),
    })
    .eq("id", session.tenant.id)
    .select("id");

  if (error || data.length === 0) {
    if (error) console.error("updateShopSettings failed:", error);
    return { status: "error", message: "We couldn't save your settings. Please try again." };
  }

  refresh();
  return { status: "success" };
}

/** Shop details printed on quotations and invoices. Admin-only (RLS enforces it too). */
export async function updateShopProfile(input: ShopProfileValues): Promise<SettingsActionResult> {
  const parsed = shopProfileSchema.safeParse(input);
  if (!parsed.success) {
    return { status: "error", message: parsed.error.issues[0]?.message ?? "Check the shop details." };
  }
  const session = await getShopSession();
  if (session.role !== "admin") {
    return { status: "error", message: "Only shop admins can change the shop details." };
  }
  const s = parsed.data;
  let phone: string | null = null;
  if (s.phone) {
    const p = parsePhone(s.phone, session.tenant.allowInternationalPhones);
    if (!p.ok) return { status: "error", message: `Phone: ${p.error}` };
    phone = p.e164;
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("tenants")
    .update({
      name: s.name,
      phone,
      email: s.email || null,
      address: s.address || null,
      ntn: s.ntn || null,
      strn: s.strn || null,
      quote_footer_notes: s.terms || null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", session.tenant.id)
    .select("id");
  if (error || data.length === 0) {
    if (error) console.error("updateShopProfile failed:", error);
    return { status: "error", message: "We couldn't save the shop details. Please try again." };
  }
  refresh();
  return { status: "success" };
}

/**
 * Saves (or clears) the shop logo after the browser uploaded it to the shop-assets bucket.
 * Only accepts a public URL inside this shop's own folder.
 */
export async function setShopLogo(url: string | null): Promise<SettingsActionResult> {
  const session = await getShopSession();
  if (session.role !== "admin") {
    return { status: "error", message: "Only shop admins can change the logo." };
  }
  const prefix = `${SUPABASE_URL}/storage/v1/object/public/shop-assets/${session.tenant.id}/`;
  if (url !== null && (!url.startsWith(prefix) || url.length > 500)) {
    return { status: "error", message: "That logo upload isn't valid. Please try again." };
  }
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("tenants")
    .update({ logo_url: url, updated_at: new Date().toISOString() })
    .eq("id", session.tenant.id)
    .select("id");
  if (error || data.length === 0) {
    if (error) console.error("setShopLogo failed:", error);
    return { status: "error", message: "We couldn't save the logo. Please try again." };
  }
  refresh();
  return { status: "success" };
}
