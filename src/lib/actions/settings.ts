"use server";

import { refresh } from "next/cache";
import { getShopSession } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { shopSettingsSchema, type ShopSettingsInput } from "@/lib/validations/settings.schema";

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
