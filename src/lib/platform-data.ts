import "server-only";
import { peopleNames, requireSuperadmin } from "@/lib/superadmin";
import { createAdminClient } from "@/lib/supabase/admin";
import type { PlatformSettingsInput } from "@/lib/validations/platform.schema";

// /admin/platform (Phase 17, deliverable 5).

/** The settings row as the form's values. */
export async function getPlatformSettings(): Promise<PlatformSettingsInput> {
  await requireSuperadmin();
  const { data: s } = await createAdminClient().from("platform_settings").select("*").single();
  if (!s) throw new Error("platform_settings row is missing");
  const list = <T,>(v: unknown) => (Array.isArray(v) ? (v as T[]) : []);
  return {
    businessName: s.business_name,
    businessAddress: s.business_address ?? "",
    businessPhone: s.business_phone ?? "",
    businessEmail: s.business_email ?? "",
    businessNtn: s.business_ntn ?? "",
    wallets: list<{ provider?: string; title?: string; number?: string }>(s.payment_wallets).map((w) => ({ provider: w.provider ?? "", title: w.title ?? "", number: w.number ?? "" })),
    banks: list<{ bank?: string; title?: string; number?: string; iban?: string }>(s.payment_banks).map((b) => ({ bank: b.bank ?? "", title: b.title ?? "", number: b.number ?? "", iban: b.iban ?? "" })),
    paymentNote: s.payment_note ?? "",
    invoiceLeadDays: s.invoice_lead_days,
    defaultGraceDays: s.default_grace_days,
    reminderDays: s.reminder_days.join(", "),
    defaultPlanId: s.default_plan_id ?? "",
    signupDefaultStatus: s.signup_default_status === "active" ? "active" : "trial",
    impersonationTtlMinutes: s.impersonation_ttl_minutes,
    emailSenderName: s.email_sender_name,
    emailReplyTo: s.email_reply_to ?? "",
    emailHourlyLimit: s.email_hourly_limit,
  };
}

export type AnnouncementRow = {
  id: string;
  message: string;
  tone: "info" | "warning";
  targets: { id: string; name: string }[] | null;
  startsAt: string;
  endsAt: string | null;
  state: "live" | "scheduled" | "ended";
  by: string;
};

/** Live and scheduled first, then the latest ended ones. */
export async function getAnnouncements(): Promise<AnnouncementRow[]> {
  await requireSuperadmin();
  const admin = createAdminClient();
  const { data } = await admin.from("announcements").select("*").order("starts_at", { ascending: false }).limit(50);
  const rows = data ?? [];
  const tenantIds = [...new Set(rows.flatMap((r) => r.target_tenant_ids ?? []))];
  const userIds = [...new Set(rows.map((r) => r.created_by).filter((v): v is string => v !== null))];
  const [{ data: tenants }, people] = await Promise.all([
    tenantIds.length ? admin.from("tenants").select("id, name").in("id", tenantIds) : Promise.resolve({ data: [] as { id: string; name: string }[] }),
    peopleNames(userIds),
  ]);
  const tenantName = new Map((tenants ?? []).map((t) => [t.id, t.name]));
  const now = new Date();
  const order = { live: 0, scheduled: 1, ended: 2 } as const;
  return rows
    .map((r): AnnouncementRow => ({
      id: r.id,
      message: r.message,
      tone: r.tone === "warning" ? "warning" : "info",
      targets: r.target_tenant_ids ? r.target_tenant_ids.map((id) => ({ id, name: tenantName.get(id) ?? "Removed organization" })) : null,
      startsAt: r.starts_at,
      endsAt: r.ends_at,
      state: r.ends_at && new Date(r.ends_at) <= now ? "ended" : new Date(r.starts_at) > now ? "scheduled" : "live",
      by: (r.created_by && people.get(r.created_by)?.fullName) || "A former superadmin",
    }))
    .sort((a, b) => order[a.state] - order[b.state])
    .slice(0, 25);
}

/** Organizations to target, by name. */
export async function getTenantChoices() {
  await requireSuperadmin();
  const { data } = await createAdminClient().from("tenants").select("id, name").is("archived_at", null).order("name").limit(1000);
  return data ?? [];
}
