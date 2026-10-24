"use server";

import { randomInt } from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { refresh } from "next/cache";
import { z } from "zod";
import { appOrigin, isResendSandboxError, passwordLink } from "@/lib/account-links";
import { sendTransactionalEmail } from "@/lib/email/send";
import { passwordResetEmail, welcomeEmail } from "@/lib/email/templates/account";
import { closeImpersonation, hashToken, newToken } from "@/lib/impersonation";
import { changeSubscriptionPlan } from "./subscriptions";
import { parsePhone } from "@/lib/phone";
import { audit, requestIp, requireSuperadmin } from "@/lib/superadmin";
import { createAdminClient } from "@/lib/supabase/admin";
import { IMPERSONATION_COOKIE, IMPERSONATION_TTL_SECONDS, OLD_IMPERSONATION_COOKIE } from "@/lib/supabase/impersonation-header";
import {
  createOrganizationSchema,
  TENANT_STATUSES,
  type CreateOrganizationInput,
  type TenantStatus,
} from "@/lib/validations/admin.schema";

// Superadmin-only actions behind /admin. Each one calls requireSuperadmin() first, works with the
// service role (cross-shop by design) and writes superadmin_audit_logs.

export type AdminActionResult = { status: "success"; message?: string } | { status: "error"; message: string };

// ---------------------------------------------------------------------------
// Impersonation ("Login As")
// ---------------------------------------------------------------------------

/**
 * Starts acting as a shop: its admin view, with the exit banner, for the platform's session length
 * (Platform settings, default 2 hours). "read_only" (Phase 17) can look at everything and change nothing.
 */
export async function startImpersonation(tenantId: string, mode: "full" | "read_only" = "full"): Promise<AdminActionResult> {
  const me = await requireSuperadmin();
  if (!z.uuid().safeParse(tenantId).success) return { status: "error", message: "That shop wasn't found." };
  if (mode !== "full" && mode !== "read_only") return { status: "error", message: "Choose full access or read-only." };
  const admin = createAdminClient();
  const { data: tenant } = await admin.from("tenants").select("id, name").eq("id", tenantId).maybeSingle();
  if (!tenant) return { status: "error", message: "That shop wasn't found." };
  const { data: settings } = await admin.from("platform_settings").select("impersonation_ttl_minutes").maybeSingle();
  const ttlSeconds = settings?.impersonation_ttl_minutes ? settings.impersonation_ttl_minutes * 60 : IMPERSONATION_TTL_SECONDS;

  const now = new Date();
  // One shop at a time: any earlier session of this superadmin ends here.
  await admin.from("impersonation_sessions").update({ ended_at: now.toISOString() }).eq("admin_id", me.userId).is("ended_at", null);
  const token = newToken();
  const { data: session, error } = await admin
    .from("impersonation_sessions")
    .insert({
      token_hash: hashToken(token),
      admin_id: me.userId,
      tenant_id: tenant.id,
      expires_at: new Date(now.getTime() + ttlSeconds * 1000).toISOString(),
      mode,
      ip_address: await requestIp(),
    })
    .select("id")
    .single();
  if (error || !session) {
    console.error("startImpersonation failed:", error);
    return { status: "error", message: "We couldn't start the session. Please try again." };
  }
  await audit({ adminId: me.userId, action: "impersonation.start", tenantId: tenant.id, details: { sessionId: session.id, shop: tenant.name, mode } });

  const store = await cookies();
  store.delete(OLD_IMPERSONATION_COOKIE);
  store.set(IMPERSONATION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: ttlSeconds,
  });
  redirect("/dashboard");
}

/**
 * Leaves the shop and returns to the shops list. The banner posts to /auth/exit-impersonation
 * instead (a read-only session can't run server actions outside /admin); kept for /admin pages.
 */
export async function endImpersonation() {
  await closeImpersonation();
  redirect("/admin/tenants");
}

// ---------------------------------------------------------------------------
// Shops
// ---------------------------------------------------------------------------

/**
 * New shop + owner. Only the superadmin creates organizations (there is no self sign-up): an invited
 * auth user, then public.admin_create_organization() (service role) makes the tenant and the admin
 * profile; tenant triggers add the walk-in customer and the default-plan subscription. The owner gets
 * a welcome email with a "Choose your password" link, or (Phase 17) a temporary password returned
 * once. Phase 17: the chosen plan and cycle replace the default plan.
 */
export async function createOrganization(
  input: CreateOrganizationInput,
): Promise<AdminActionResult & { tenantId?: string; password?: string }> {
  const me = await requireSuperadmin();
  const parsed = createOrganizationSchema.safeParse(input);
  if (!parsed.success) return { status: "error", message: parsed.error.issues[0]?.message ?? "Check the details." };
  const { shopName, fullName, industryId, email, phone, status, planId, cycle, access } = parsed.data;
  const { data: industry } = await createAdminClient().from("industries").select("name, is_active").eq("id", industryId).maybeSingle();
  if (!industry) return { status: "error", message: "That industry doesn't exist." };
  if (!industry.is_active) return { status: "error", message: `${industry.name} is closed for new organizations. Open it in Catalog → Industries first.` };
  if (planId) {
    const { data: plan } = await createAdminClient().from("subscription_plans").select("price_monthly, price_yearly, retired_at").eq("id", planId).maybeSingle();
    if (!plan || plan.retired_at) return { status: "error", message: "That plan isn't available." };
    if ((cycle === "monthly" ? plan.price_monthly : plan.price_yearly) === null) {
      return { status: "error", message: `That plan isn't offered ${cycle === "monthly" ? "monthly" : "yearly"}.` };
    }
  }
  let e164: string | null = null;
  if (phone) {
    const p = parsePhone(phone, false);
    if (!p.ok) return { status: "error", message: `Phone: ${p.error}` };
    e164 = p.e164;
  }

  const admin = createAdminClient();
  const { data: link, error } = await admin.auth.admin.generateLink({
    type: "invite",
    email,
    options: { data: { full_name: fullName } },
  });
  if (error || !link.user) {
    if (error?.code === "email_exists" || /already been registered|already exists/i.test(error?.message ?? "")) {
      return { status: "error", message: "An account with this email already exists." };
    }
    console.error("createOrganization failed:", error);
    return { status: "error", message: "We couldn't create the shop. Please try again." };
  }
  const { data: tenantId, error: orgError } = await admin.rpc("admin_create_organization", {
    p_user: link.user.id,
    p_shop_name: shopName,
    p_full_name: fullName,
    p_industry: industryId,
  });
  if (orgError || !tenantId) {
    // No half-made owner left behind: the email can be used again.
    await admin.auth.admin.deleteUser(link.user.id);
    console.error("admin_create_organization failed:", orgError);
    return { status: "error", message: orgError?.code === "22023" ? orgError.message : "We couldn't create the shop. Please try again." };
  }
  await admin.from("tenants").update({ phone: e164, status, updated_at: new Date().toISOString() }).eq("id", tenantId);

  // The chosen plan: from today, as a trial of the plan's length or billed from today.
  let planNote = "";
  if (planId) {
    const changed = await changeSubscriptionPlan(tenantId, {
      planId,
      cycle,
      when: "now",
      startAs: status === "trial" ? "trial" : "active",
      keepPrice: false,
      reason: "Chosen when the organization was created",
    });
    if (changed.status === "error") planNote = ` The plan couldn't be set (${changed.message}); set it on the Subscription tab.`;
  }

  if (access === "password") {
    const password = Array.from({ length: 12 }, () => PASSWORD_CHARS[randomInt(PASSWORD_CHARS.length)]).join("");
    const { error: pwError } = await admin.auth.admin.updateUserById(link.user.id, { password, email_confirm: true });
    await audit({
      adminId: me.userId,
      action: "tenant.create",
      tenantId,
      userId: link.user.id,
      details: { shop: shopName, owner: email, industry: industry.name, status, plan: planId || "default", access: "temporary_password" },
    });
    refresh();
    if (pwError) {
      console.error("createOrganization password failed:", pwError);
      return { status: "success", tenantId, message: `${shopName} was created, but the password couldn't be set. Use Users → Set a temporary password.${planNote}` };
    }
    return { status: "success", tenantId, password, message: `${shopName} was created.${planNote}` };
  }

  const sent = await sendTransactionalEmail({
    template: "welcome",
    to: email,
    content: welcomeEmail({
      fullName,
      shopName,
      email,
      loginUrl: `${await appOrigin()}/login`,
      setPasswordUrl: passwordLink(await appOrigin(), link.properties.hashed_token, "invite"),
    }),
    tenantId,
    sentBy: me.userId,
  });
  await audit({
    adminId: me.userId,
    action: "tenant.create",
    tenantId,
    userId: link.user.id,
    details: { shop: shopName, owner: email, industry: industry.name, status, plan: planId || "default", welcomeEmail: sent.status },
  });
  refresh();
  return {
    status: "success",
    tenantId,
    message:
      sent.status === "failed"
        ? `${shopName} was created, but the welcome email couldn't be sent. Use Users → Reset password to send ${fullName} a link.`
        : sent.status === "logged"
          ? `${shopName} was created. Email isn't set up on this server, so the welcome email was printed to the server console.`
          : `${shopName} was created and ${fullName} was emailed a link to choose a password.${planNote}`,
  };
}

/**
 * Active / Trial / Suspended. Suspended shops' users are signed out and can't sign in; `reason`
 * (Phase 17) is shown to them at sign-in. Leaving suspended clears it.
 */
export async function setTenantStatus(tenantId: string, status: TenantStatus, reason?: string): Promise<AdminActionResult> {
  const me = await requireSuperadmin();
  const why = reason?.trim() || null;
  if (!z.uuid().safeParse(tenantId).success || !TENANT_STATUSES.includes(status) || (why && why.length > 300)) {
    return { status: "error", message: "That change isn't valid." };
  }
  const admin = createAdminClient();
  const { data: before } = await admin.from("tenants").select("name, status").eq("id", tenantId).maybeSingle();
  if (!before) return { status: "error", message: "That shop wasn't found." };
  if (before.status === status && status !== "suspended") return { status: "success" };
  const statusReason = status === "suspended" ? why : null;
  const { error } = await admin.from("tenants").update({ status, status_reason: statusReason, updated_at: new Date().toISOString() }).eq("id", tenantId);
  if (error) {
    console.error("setTenantStatus failed:", error);
    return { status: "error", message: "We couldn't change the shop's status. Please try again." };
  }
  await audit({ adminId: me.userId, action: "tenant.status", tenantId, reason: statusReason, details: { shop: before.name, before: before.status, after: status } });
  refresh();
  return { status: "success" };
}

// ---------------------------------------------------------------------------
// Users
// ---------------------------------------------------------------------------

async function loadUser(userId: string) {
  if (!z.uuid().safeParse(userId).success) return null;
  const { data } = await createAdminClient().from("profiles").select("id, full_name, email, role, tenant_id").eq("id", userId).maybeSingle();
  return data;
}

/** Emails the user a one-time link to choose a new password (valid 1 hour). */
export async function sendPasswordReset(userId: string): Promise<AdminActionResult> {
  const me = await requireSuperadmin();
  const user = await loadUser(userId);
  if (!user) return { status: "error", message: "That user wasn't found." };
  const { data: link, error } = await createAdminClient().auth.admin.generateLink({ type: "recovery", email: user.email });
  if (error) {
    console.error("sendPasswordReset failed:", error);
    return { status: "error", message: "We couldn't create a reset link. Please try again." };
  }
  const sent = await sendTransactionalEmail({
    template: "password_reset",
    to: user.email,
    content: passwordResetEmail({ fullName: user.full_name, resetUrl: passwordLink(await appOrigin(), link.properties.hashed_token, "recovery") }),
    tenantId: user.tenant_id,
    sentBy: me.userId,
  });
  await audit({ adminId: me.userId, action: "user.password_reset_email", tenantId: user.tenant_id, userId: user.id, details: { email: user.email, delivery: sent.status } });
  if (sent.status === "failed") {
    return {
      status: "error",
      message: isResendSandboxError(sent.error)
        ? "Email can only go to the account owner's address until a domain is verified in Resend. Set a temporary password instead."
        : "We couldn't send the email. Set a temporary password instead.",
    };
  }
  return {
    status: "success",
    message: sent.status === "logged" ? "Email isn't set up on this server: the link was printed to the server console." : `A reset link was emailed to ${user.email}.`,
  };
}

// No 0/O or 1/l/I, so it can be read out over the phone.
const PASSWORD_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";

/** Sets a random temporary password and returns it once, to hand over; it isn't stored or logged. */
export async function setTemporaryPassword(userId: string): Promise<AdminActionResult & { password?: string }> {
  const me = await requireSuperadmin();
  const user = await loadUser(userId);
  if (!user) return { status: "error", message: "That user wasn't found." };
  const password = Array.from({ length: 12 }, () => PASSWORD_CHARS[randomInt(PASSWORD_CHARS.length)]).join("");
  const { error } = await createAdminClient().auth.admin.updateUserById(user.id, { password });
  if (error) {
    console.error("setTemporaryPassword failed:", error);
    return { status: "error", message: "We couldn't set the password. Please try again." };
  }
  await audit({ adminId: me.userId, action: "user.temporary_password", tenantId: user.tenant_id, userId: user.id, details: { email: user.email } });
  return { status: "success", password };
}

/** Admin ↔ Staff within the user's shop. A shop always keeps at least one admin. */
export async function setUserRole(userId: string, role: "admin" | "staff"): Promise<AdminActionResult> {
  const me = await requireSuperadmin();
  if (role !== "admin" && role !== "staff") return { status: "error", message: "That role isn't valid." };
  const user = await loadUser(userId);
  if (!user) return { status: "error", message: "That user wasn't found." };
  if (user.role === role) return { status: "success" };
  const admin = createAdminClient();
  if (role === "staff") {
    const { count } = await admin.from("profiles").select("id", { count: "exact", head: true }).eq("tenant_id", user.tenant_id).eq("role", "admin");
    if ((count ?? 0) <= 1) return { status: "error", message: `${user.full_name} is the shop's only admin. Make someone else admin first.` };
  }
  const { error } = await admin.from("profiles").update({ role, updated_at: new Date().toISOString() }).eq("id", user.id);
  if (error) {
    console.error("setUserRole failed:", error);
    return { status: "error", message: "We couldn't change the role. Please try again." };
  }
  await audit({ adminId: me.userId, action: "user.role", tenantId: user.tenant_id, userId: user.id, details: { email: user.email, before: user.role, after: role } });
  refresh();
  return { status: "success" };
}

/**
 * Ends every session of the user (Phase 17): they're signed out on every device at their next
 * request once the current access token expires (up to an hour), or at once if deactivated.
 */
export async function forceSignOut(userId: string): Promise<AdminActionResult> {
  const me = await requireSuperadmin();
  const user = await loadUser(userId);
  if (!user) return { status: "error", message: "That user wasn't found." };
  if (user.id === me.userId) return { status: "error", message: "Sign yourself out from the user menu instead." };
  const { data, error } = await createAdminClient().rpc("admin_force_sign_out", { p_user: user.id });
  if (error) {
    console.error("forceSignOut failed:", error);
    return { status: "error", message: "We couldn't end their sessions. Please try again." };
  }
  await audit({ adminId: me.userId, action: "user.force_sign_out", tenantId: user.tenant_id, userId: user.id, details: { email: user.email, sessions: data ?? 0 } });
  return {
    status: "success",
    message: data ? `${user.full_name}'s ${data === 1 ? "session was" : `${data} sessions were`} ended. Open pages stop working within the hour.` : `${user.full_name} had no open sessions.`,
  };
}

/** Makes an active admin of the organization its owner (Phase 17). */
export async function transferOwnership(tenantId: string, userId: string, reason: string): Promise<AdminActionResult> {
  const me = await requireSuperadmin();
  const why = z.string().trim().min(3, "Say why.").max(300).safeParse(reason);
  if (!why.success) return { status: "error", message: why.error.issues[0]?.message ?? "Say why." };
  const user = await loadUser(userId);
  if (!user || user.tenant_id !== tenantId) return { status: "error", message: "That user isn't in this organization." };
  const admin = createAdminClient();
  const [{ data: profile }, { data: tenant }] = await Promise.all([
    admin.from("profiles").select("deactivated_at").eq("id", user.id).single(),
    admin.from("tenants").select("name, owner_id").eq("id", tenantId).single(),
  ]);
  if (user.role !== "admin" || profile?.deactivated_at) return { status: "error", message: `${user.full_name} must be an active admin first.` };
  if (tenant?.owner_id === user.id) return { status: "success", message: `${user.full_name} is already the owner.` };
  const { error } = await admin.from("tenants").update({ owner_id: user.id, updated_at: new Date().toISOString() }).eq("id", tenantId);
  if (error) {
    console.error("transferOwnership failed:", error);
    return { status: "error", message: "We couldn't change the owner. Please try again." };
  }
  await audit({ adminId: me.userId, action: "tenant.owner", tenantId, userId: user.id, reason: why.data, details: { before: tenant?.owner_id ?? null, after: user.id, email: user.email } });
  refresh();
  return { status: "success", message: `${user.full_name} now owns ${tenant?.name ?? "the organization"}. Subscription emails go to them.` };
}
