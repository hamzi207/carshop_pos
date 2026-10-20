"use server";

import { randomInt } from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { refresh } from "next/cache";
import { z } from "zod";
import { appOrigin, isResendSandboxError, passwordLink } from "@/lib/account-links";
import { sendTransactionalEmail } from "@/lib/email/send";
import { passwordResetEmail, welcomeEmail } from "@/lib/email/templates/account";
import { hashToken, newToken } from "@/lib/impersonation";
import { parsePhone } from "@/lib/phone";
import { audit, requestIp, requireSuperadmin } from "@/lib/superadmin";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  IMPERSONATION_COOKIE,
  IMPERSONATION_TTL_SECONDS,
  OLD_IMPERSONATION_COOKIE,
  readImpersonationToken,
} from "@/lib/supabase/impersonation-header";
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

/** Starts acting as a shop: its admin view, with the exit banner, for up to 2 hours. */
export async function startImpersonation(tenantId: string): Promise<AdminActionResult> {
  const me = await requireSuperadmin();
  if (!z.uuid().safeParse(tenantId).success) return { status: "error", message: "That shop wasn't found." };
  const admin = createAdminClient();
  const { data: tenant } = await admin.from("tenants").select("id, name").eq("id", tenantId).maybeSingle();
  if (!tenant) return { status: "error", message: "That shop wasn't found." };

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
      expires_at: new Date(now.getTime() + IMPERSONATION_TTL_SECONDS * 1000).toISOString(),
      ip_address: await requestIp(),
    })
    .select("id")
    .single();
  if (error || !session) {
    console.error("startImpersonation failed:", error);
    return { status: "error", message: "We couldn't start the session. Please try again." };
  }
  await audit({ adminId: me.userId, action: "impersonation.start", tenantId: tenant.id, details: { sessionId: session.id, shop: tenant.name } });

  const store = await cookies();
  store.delete(OLD_IMPERSONATION_COOKIE);
  store.set(IMPERSONATION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: IMPERSONATION_TTL_SECONDS,
  });
  redirect("/dashboard");
}

/** Leaves the shop (the banner's Exit) and returns to the shops list. */
export async function endImpersonation() {
  const store = await cookies();
  const token = readImpersonationToken(store);
  store.delete(IMPERSONATION_COOKIE);
  store.delete(OLD_IMPERSONATION_COOKIE);
  if (token) {
    const admin = createAdminClient();
    const { data: session } = await admin
      .from("impersonation_sessions")
      .update({ ended_at: new Date().toISOString() })
      .eq("token_hash", hashToken(token))
      .is("ended_at", null)
      .select("id, admin_id, tenant_id, started_at")
      .maybeSingle();
    if (session) {
      const minutes = Math.round((Date.now() - new Date(session.started_at).getTime()) / 60000);
      await audit({ adminId: session.admin_id, action: "impersonation.end", tenantId: session.tenant_id, details: { sessionId: session.id, minutes } });
    }
  }
  redirect("/admin/tenants");
}

// ---------------------------------------------------------------------------
// Shops
// ---------------------------------------------------------------------------

/**
 * New shop + owner through the normal sign-up provisioning: an invited auth user with shop_name /
 * full_name metadata fires the on-signup trigger (tenant, admin profile, default categories,
 * walk-in customer). The owner gets a welcome email with a "Choose your password" link.
 */
export async function createOrganization(input: CreateOrganizationInput): Promise<AdminActionResult & { tenantId?: string }> {
  const me = await requireSuperadmin();
  const parsed = createOrganizationSchema.safeParse(input);
  if (!parsed.success) return { status: "error", message: parsed.error.issues[0]?.message ?? "Check the details." };
  const { shopName, fullName, email, phone, status } = parsed.data;
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
    options: { data: { shop_name: shopName, full_name: fullName } },
  });
  if (error || !link.user) {
    if (error?.code === "email_exists" || /already been registered|already exists/i.test(error?.message ?? "")) {
      return { status: "error", message: "An account with this email already exists." };
    }
    console.error("createOrganization failed:", error);
    return { status: "error", message: "We couldn't create the shop. Please try again." };
  }
  const { data: profile } = await admin.from("profiles").select("tenant_id").eq("id", link.user.id).single();
  if (!profile) return { status: "error", message: "The owner was created, but their shop wasn't. Check the database trigger." };
  await admin.from("tenants").update({ phone: e164, status, updated_at: new Date().toISOString() }).eq("id", profile.tenant_id);

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
    tenantId: profile.tenant_id,
    sentBy: me.userId,
  });
  await audit({
    adminId: me.userId,
    action: "tenant.create",
    tenantId: profile.tenant_id,
    userId: link.user.id,
    details: { shop: shopName, owner: email, status, welcomeEmail: sent.status },
  });
  refresh();
  return {
    status: "success",
    tenantId: profile.tenant_id,
    message:
      sent.status === "failed"
        ? `${shopName} was created, but the welcome email couldn't be sent. Use Users → Reset password to send ${fullName} a link.`
        : sent.status === "logged"
          ? `${shopName} was created. Email isn't set up on this server, so the welcome email was printed to the server console.`
          : `${shopName} was created and ${fullName} was emailed a link to choose a password.`,
  };
}

/** Active / Trial / Suspended. Suspended shops' users are signed out and can't sign in. */
export async function setTenantStatus(tenantId: string, status: TenantStatus): Promise<AdminActionResult> {
  const me = await requireSuperadmin();
  if (!z.uuid().safeParse(tenantId).success || !TENANT_STATUSES.includes(status)) {
    return { status: "error", message: "That change isn't valid." };
  }
  const admin = createAdminClient();
  const { data: before } = await admin.from("tenants").select("name, status").eq("id", tenantId).maybeSingle();
  if (!before) return { status: "error", message: "That shop wasn't found." };
  if (before.status === status) return { status: "success" };
  const { error } = await admin.from("tenants").update({ status, updated_at: new Date().toISOString() }).eq("id", tenantId);
  if (error) {
    console.error("setTenantStatus failed:", error);
    return { status: "error", message: "We couldn't change the shop's status. Please try again." };
  }
  await audit({ adminId: me.userId, action: "tenant.status", tenantId, details: { shop: before.name, before: before.status, after: status } });
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
