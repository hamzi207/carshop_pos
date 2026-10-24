"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { audit, changedFields, requireSuperadmin } from "@/lib/superadmin";
import { createAdminClient } from "@/lib/supabase/admin";
import { announcementSchema, platformSettingsSchema, type AnnouncementInput, type PlatformSettingsInput } from "@/lib/validations/platform.schema";
import type { AdminActionResult } from "./admin";

// /admin/platform (Phase 17, deliverable 5): platform settings and announcements. Superadmin only, audited.

const fail = (message: string): AdminActionResult => ({ status: "error", message });

export async function savePlatformSettings(input: PlatformSettingsInput): Promise<AdminActionResult> {
  const me = await requireSuperadmin();
  const parsed = platformSettingsSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Check the settings.");
  const v = parsed.data;
  const admin = createAdminClient();
  if (v.defaultPlanId) {
    const { data: plan } = await admin.from("subscription_plans").select("visibility, retired_at").eq("id", v.defaultPlanId).maybeSingle();
    if (!plan || plan.retired_at || plan.visibility !== "standard") return fail("The default plan must be a standard plan that isn't retired.");
  }
  const row = {
    business_name: v.businessName,
    business_address: v.businessAddress,
    business_phone: v.businessPhone,
    business_email: v.businessEmail,
    business_ntn: v.businessNtn,
    payment_wallets: v.wallets,
    payment_banks: v.banks.map((b) => ({ ...b, iban: b.iban || undefined })),
    payment_note: v.paymentNote,
    invoice_lead_days: v.invoiceLeadDays,
    default_grace_days: v.defaultGraceDays,
    reminder_days: v.reminderDays,
    default_plan_id: v.defaultPlanId,
    signup_default_status: v.signupDefaultStatus,
    impersonation_ttl_minutes: v.impersonationTtlMinutes,
    email_sender_name: v.emailSenderName,
    email_reply_to: v.emailReplyTo,
    email_hourly_limit: v.emailHourlyLimit,
  };
  const { data: before } = await admin.from("platform_settings").select("*").maybeSingle();
  const { error } = await admin
    .from("platform_settings")
    .update({ ...row, updated_at: new Date().toISOString(), updated_by: me.userId })
    .eq("id", true);
  if (error) {
    console.error("savePlatformSettings failed:", error);
    return fail("We couldn't save the platform settings. Please try again.");
  }
  const diff = changedFields((before ?? {}) as Record<string, unknown>, JSON.parse(JSON.stringify(row)) as Record<string, unknown>);
  if (Object.keys(diff.after).length) await audit({ adminId: me.userId, action: "platform.settings", details: diff });
  refresh();
  return { status: "success", message: "New settings apply from the next new organization, invoice, email and Login As." };
}

/** datetime-local in Pakistan time (UTC+5, no daylight saving) → ISO. */
const karachi = (local: string) => new Date(`${local}:00+05:00`).toISOString();

export async function createAnnouncement(input: AnnouncementInput): Promise<AdminActionResult> {
  const me = await requireSuperadmin();
  const parsed = announcementSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Check the announcement.");
  const v = parsed.data;
  const isLocal = (s: string) => /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(s);
  if ((v.startsAt && !isLocal(v.startsAt)) || (v.endsAt && !isLocal(v.endsAt))) return fail("Pick valid dates.");
  const startsAt = v.startsAt ? karachi(v.startsAt) : new Date().toISOString();
  const endsAt = v.endsAt ? karachi(v.endsAt) : null;
  if (endsAt && endsAt <= new Date().toISOString()) return fail("The end is already in the past.");
  const { data, error } = await createAdminClient()
    .from("announcements")
    .insert({ message: v.message, tone: v.tone, target_tenant_ids: v.tenantIds.length ? v.tenantIds : null, starts_at: startsAt, ends_at: endsAt, created_by: me.userId })
    .select("id")
    .single();
  if (error) {
    console.error("createAnnouncement failed:", error);
    return fail("We couldn't post the announcement. Please try again.");
  }
  await audit({ adminId: me.userId, action: "announcement.create", details: { id: data.id, message: v.message, tone: v.tone, organizations: v.tenantIds.length || "all", startsAt, endsAt } });
  refresh();
  return { status: "success", message: v.tenantIds.length ? `Shown to ${v.tenantIds.length} organization${v.tenantIds.length === 1 ? "" : "s"}.` : "Shown to every organization." };
}

/** Ends it now (kept for the record). */
export async function endAnnouncement(announcementId: string): Promise<AdminActionResult> {
  const me = await requireSuperadmin();
  if (!z.uuid().safeParse(announcementId).success) return fail("That announcement wasn't found.");
  const admin = createAdminClient();
  const { data: a } = await admin.from("announcements").select("message, starts_at, ends_at").eq("id", announcementId).maybeSingle();
  if (!a) return fail("That announcement wasn't found.");
  const now = new Date();
  if (a.ends_at && new Date(a.ends_at) <= now) return { status: "success" };
  // One that hasn't started yet moves its start back a second (the table needs end > start).
  const startsAt = new Date(a.starts_at) < now ? a.starts_at : new Date(now.getTime() - 1000).toISOString();
  const { error } = await admin.from("announcements").update({ starts_at: startsAt, ends_at: now.toISOString() }).eq("id", announcementId);
  if (error) {
    console.error("endAnnouncement failed:", error);
    return fail("We couldn't end the announcement. Please try again.");
  }
  await audit({ adminId: me.userId, action: "announcement.end", details: { id: announcementId, message: a.message } });
  refresh();
  return { status: "success" };
}
