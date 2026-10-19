"use server";

import { refresh } from "next/cache";
import { getShopSession } from "@/lib/auth";
import { audit, requireSuperadmin } from "@/lib/superadmin";
import { createAdminClient } from "@/lib/supabase/admin";
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

/**
 * Whose shop details change: the caller's own shop (shop admins, through RLS), or with `tenantId`
 * any shop (a superadmin on /admin/tenants/[id], with the service role and an audit log entry).
 */
async function shopTarget(tenantId: string | undefined, forbidden: string) {
  if (tenantId) {
    const me = await requireSuperadmin();
    const client = createAdminClient();
    const { data } = await client.from("tenants").select("*").eq("id", tenantId).maybeSingle();
    if (!data) return { ok: false, message: "That shop wasn't found." } as const;
    return { ok: true, client, tenantId: data.id, allowInternationalPhones: data.allow_international_phones, adminId: me.userId, before: data } as const;
  }
  const session = await getShopSession();
  if (session.role !== "admin") return { ok: false, message: forbidden } as const;
  return {
    ok: true,
    client: await createClient(),
    tenantId: session.tenant.id,
    allowInternationalPhones: session.tenant.allowInternationalPhones,
    adminId: null,
    before: null,
  } as const;
}

/** Shop details printed on quotations and invoices. Admin-only (RLS enforces it too); superadmins pass `tenantId`. */
export async function updateShopProfile(input: ShopProfileValues, tenantId?: string): Promise<SettingsActionResult> {
  const parsed = shopProfileSchema.safeParse(input);
  if (!parsed.success) {
    return { status: "error", message: parsed.error.issues[0]?.message ?? "Check the shop details." };
  }
  const target = await shopTarget(tenantId, "Only shop admins can change the shop details.");
  if (!target.ok) return { status: "error", message: target.message };
  const s = parsed.data;
  let phone: string | null = null;
  if (s.phone) {
    const p = parsePhone(s.phone, target.allowInternationalPhones);
    if (!p.ok) return { status: "error", message: `Phone: ${p.error}` };
    phone = p.e164;
  }

  const changes = {
    name: s.name,
    phone,
    email: s.email || null,
    address: s.address || null,
    ntn: s.ntn || null,
    strn: s.strn || null,
    quote_footer_notes: s.terms || null,
  };
  const { data, error } = await target.client
    .from("tenants")
    .update({ ...changes, updated_at: new Date().toISOString() })
    .eq("id", target.tenantId)
    .select("id");
  if (error || data.length === 0) {
    if (error) console.error("updateShopProfile failed:", error);
    return { status: "error", message: "We couldn't save the shop details. Please try again." };
  }
  if (target.adminId && target.before) {
    const before: Record<string, unknown> = target.before;
    const changed = Object.entries(changes).filter(([k, v]) => before[k] !== v);
    await audit({
      adminId: target.adminId,
      action: "tenant.update",
      tenantId: target.tenantId,
      details: {
        before: Object.fromEntries(changed.map(([k]) => [k, (before[k] ?? null) as string | null])),
        after: Object.fromEntries(changed),
      },
    });
  }
  refresh();
  return { status: "success" };
}

/**
 * Saves (or clears) the shop logo after the browser uploaded it to the shop-assets bucket.
 * Only accepts a public URL inside this shop's own folder.
 */
export async function setShopLogo(url: string | null, tenantId?: string): Promise<SettingsActionResult> {
  const target = await shopTarget(tenantId, "Only shop admins can change the logo.");
  if (!target.ok) return { status: "error", message: target.message };
  const prefix = `${SUPABASE_URL}/storage/v1/object/public/shop-assets/${target.tenantId}/`;
  if (url !== null && (!url.startsWith(prefix) || url.length > 500)) {
    return { status: "error", message: "That logo upload isn't valid. Please try again." };
  }
  const { data, error } = await target.client
    .from("tenants")
    .update({ logo_url: url, updated_at: new Date().toISOString() })
    .eq("id", target.tenantId)
    .select("id");
  if (error || data.length === 0) {
    if (error) console.error("setShopLogo failed:", error);
    return { status: "error", message: "We couldn't save the logo. Please try again." };
  }
  if (target.adminId) await audit({ adminId: target.adminId, action: "tenant.logo_removed", tenantId: target.tenantId });
  refresh();
  return { status: "success" };
}
