"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { appOrigin, isResendSandboxError, passwordLink } from "@/lib/account-links";
import { getShopSession, type ShopSession } from "@/lib/auth";
import { sendTransactionalEmail } from "@/lib/email/send";
import { staffInviteEmail } from "@/lib/email/templates/account";
import { createAdminClient } from "@/lib/supabase/admin";
import { teamInviteSchema, TEAM_ROLES, type TeamInviteInput, type TeamRole } from "@/lib/validations/team.schema";

// Settings → Team (Phase 14). Shop admins manage their own shop's members. Account changes
// (create, ban, links) need the service role, so every query here is pinned to the caller's
// tenant from getShopSession() (RLS-derived; a superadmin acting as a shop counts as its admin).

export type TeamActionResult = { status: "success"; message?: string } | { status: "error"; message: string };

/** Signed-in shop admin, or an error to return. */
async function teamAdmin() {
  const session = await getShopSession();
  if (session.role !== "admin") return { ok: false, message: "Only shop admins can manage the team." } as const;
  return { ok: true, session, admin: createAdminClient() } as const;
}

/** A member of the caller's shop (never another shop's user). */
async function loadMember(admin: ReturnType<typeof createAdminClient>, tenantId: string, userId: string) {
  if (!z.uuid().safeParse(userId).success) return null;
  const { data } = await admin
    .from("profiles")
    .select("id, full_name, email, role, deactivated_at")
    .eq("tenant_id", tenantId)
    .eq("id", userId)
    .maybeSingle();
  return data;
}

/** Other active admins in the shop, so it is never left without one. */
async function otherActiveAdmins(admin: ReturnType<typeof createAdminClient>, tenantId: string, userId: string) {
  const { count } = await admin
    .from("profiles")
    .select("id", { count: "exact", head: true })
    .eq("tenant_id", tenantId)
    .eq("role", "admin")
    .is("deactivated_at", null)
    .neq("id", userId);
  return count ?? 0;
}

/**
 * Emails the "Accept invitation" link: a one-time link to choose a password (1 hour), through
 * /auth/confirm → /reset-password. The result message says whether it reached them.
 */
async function sendInvite(session: ShopSession, member: { fullName: string; email: string; role: TeamRole }) {
  const { data: link, error } = await createAdminClient().auth.admin.generateLink({ type: "recovery", email: member.email });
  if (error) {
    console.error("team invite link failed:", error);
    return { sent: false, message: "We couldn't create the invitation link. Use Resend invite to try again." };
  }
  const sent = await sendTransactionalEmail({
    template: "staff_invite",
    to: member.email,
    content: staffInviteEmail({
      inviteeName: member.fullName,
      inviterName: session.fullName,
      shopName: session.tenant.name,
      role: member.role,
      inviteUrl: passwordLink(await appOrigin(), link.properties.hashed_token, "recovery"),
    }),
    tenantId: session.tenant.id,
    sentBy: session.userId,
  });
  if (sent.status === "failed") {
    return {
      sent: false,
      message: isResendSandboxError(sent.error)
        ? `Email can only go to the account owner's address until a sending domain is verified, so ${member.email} didn't get it.`
        : `The email to ${member.email} couldn't be sent. Use Resend invite to try again.`,
    };
  }
  return {
    sent: true,
    message: sent.status === "logged" ? "Email isn't set up on this server: the link was printed to the server console." : `Invitation emailed to ${member.email}.`,
  };
}

/** Adds a member to this shop and emails them an invitation to choose a password. */
export async function inviteTeamMember(input: TeamInviteInput): Promise<TeamActionResult> {
  const parsed = teamInviteSchema.safeParse(input);
  if (!parsed.success) return { status: "error", message: parsed.error.issues[0]?.message ?? "Check the details." };
  const ctx = await teamAdmin();
  if (!ctx.ok) return { status: "error", message: ctx.message };
  const { session, admin } = ctx;
  const { fullName, email, role } = parsed.data;

  const { data: existing } = await admin.from("profiles").select("tenant_id").eq("email", email).maybeSingle();
  if (existing) {
    return {
      status: "error",
      message: existing.tenant_id === session.tenant.id ? `${email} is already on your team.` : `${email} already has a CarShop POS account with another shop.`,
    };
  }

  // No shop_name in the metadata, so the sign-up trigger doesn't create a shop: the profile below
  // joins this one. Confirmed up front because the invitation link proves the address.
  const { data: created, error } = await admin.auth.admin.createUser({ email, email_confirm: true, user_metadata: { full_name: fullName } });
  if (error || !created.user) {
    if (error?.code === "email_exists") return { status: "error", message: `${email} already has a CarShop POS account.` };
    console.error("inviteTeamMember createUser failed:", error);
    return { status: "error", message: "We couldn't create the invitation. Please try again." };
  }
  const { error: profileError } = await admin
    .from("profiles")
    .insert({ id: created.user.id, tenant_id: session.tenant.id, full_name: fullName, email, role });
  if (profileError) {
    console.error("inviteTeamMember profile failed:", profileError);
    await admin.auth.admin.deleteUser(created.user.id);
    return { status: "error", message: "We couldn't create the invitation. Please try again." };
  }

  const invite = await sendInvite(session, { fullName, email, role });
  refresh();
  return invite.sent
    ? { status: "success", message: invite.message }
    : { status: "success", message: `${fullName} was added as Invited. ${invite.message}` };
}

/** A new invitation link for someone who hasn't signed in yet. */
export async function resendInvite(userId: string): Promise<TeamActionResult> {
  const ctx = await teamAdmin();
  if (!ctx.ok) return { status: "error", message: ctx.message };
  const member = await loadMember(ctx.admin, ctx.session.tenant.id, userId);
  if (!member) return { status: "error", message: "That team member wasn't found." };
  const { data } = await ctx.admin.auth.admin.getUserById(member.id);
  if (data.user?.last_sign_in_at) return { status: "error", message: `${member.full_name} has already accepted and signed in.` };
  if (member.deactivated_at) return { status: "error", message: `Reactivate ${member.full_name} first.` };
  const invite = await sendInvite(ctx.session, { fullName: member.full_name, email: member.email, role: member.role === "admin" ? "admin" : "staff" });
  return invite.sent ? { status: "success", message: invite.message } : { status: "error", message: invite.message };
}

/** Admin ↔ Staff. The shop always keeps at least one active admin. */
export async function setMemberRole(userId: string, role: TeamRole): Promise<TeamActionResult> {
  if (!TEAM_ROLES.includes(role)) return { status: "error", message: "That role isn't valid." };
  const ctx = await teamAdmin();
  if (!ctx.ok) return { status: "error", message: ctx.message };
  const member = await loadMember(ctx.admin, ctx.session.tenant.id, userId);
  if (!member) return { status: "error", message: "That team member wasn't found." };
  if (member.role === role) return { status: "success" };
  if (role === "staff" && (await otherActiveAdmins(ctx.admin, ctx.session.tenant.id, member.id)) === 0) {
    return { status: "error", message: `${member.full_name} is the shop's only admin. Make someone else admin first.` };
  }
  const { error } = await ctx.admin.from("profiles").update({ role, updated_at: new Date().toISOString() }).eq("id", member.id);
  if (error) {
    console.error("setMemberRole failed:", error);
    return { status: "error", message: "We couldn't change the role. Please try again." };
  }
  refresh();
  return { status: "success", message: `${member.full_name} is now ${role === "admin" ? "an admin" : "staff"}.` };
}

/**
 * Deactivate: they're signed out at their next click (RLS stops seeing the shop) and can't sign in
 * (banned in Supabase Auth). Their quotations and invoices stay. Reactivate undoes both.
 */
export async function setMemberActive(userId: string, active: boolean): Promise<TeamActionResult> {
  const ctx = await teamAdmin();
  if (!ctx.ok) return { status: "error", message: ctx.message };
  const { session, admin } = ctx;
  if (userId === session.userId) return { status: "error", message: "You can't deactivate yourself." };
  const member = await loadMember(admin, session.tenant.id, userId);
  if (!member) return { status: "error", message: "That team member wasn't found." };
  if (Boolean(member.deactivated_at) === !active) return { status: "success" };
  if (!active && member.role === "admin" && (await otherActiveAdmins(admin, session.tenant.id, member.id)) === 0) {
    return { status: "error", message: `${member.full_name} is the shop's only admin. Make someone else admin first.` };
  }

  const { error: banError } = await admin.auth.admin.updateUserById(member.id, { ban_duration: active ? "none" : "876000h" });
  if (banError) {
    console.error("setMemberActive ban failed:", banError);
    return { status: "error", message: "We couldn't change their access. Please try again." };
  }
  const { error } = await admin
    .from("profiles")
    .update({ deactivated_at: active ? null : new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq("id", member.id);
  if (error) {
    console.error("setMemberActive failed:", error);
    await admin.auth.admin.updateUserById(member.id, { ban_duration: active ? "876000h" : "none" });
    return { status: "error", message: "We couldn't change their access. Please try again." };
  }
  refresh();
  return {
    status: "success",
    message: active ? `${member.full_name} can sign in again.` : `${member.full_name} can no longer sign in. Their documents stay in the shop.`,
  };
}

/** Withdraws an invitation nobody has accepted yet (e.g. a typo in the email): the account is removed. */
export async function cancelInvite(userId: string): Promise<TeamActionResult> {
  const ctx = await teamAdmin();
  if (!ctx.ok) return { status: "error", message: ctx.message };
  const member = await loadMember(ctx.admin, ctx.session.tenant.id, userId);
  if (!member) return { status: "error", message: "That team member wasn't found." };
  const { data } = await ctx.admin.auth.admin.getUserById(member.id);
  if (data.user?.last_sign_in_at) return { status: "error", message: `${member.full_name} has already signed in. Deactivate them instead.` };
  const { error: profileError } = await ctx.admin.from("profiles").delete().eq("id", member.id).eq("tenant_id", ctx.session.tenant.id);
  if (profileError) {
    console.error("cancelInvite profile failed:", profileError);
    return { status: "error", message: "We couldn't cancel the invitation. Please try again." };
  }
  const { error } = await ctx.admin.auth.admin.deleteUser(member.id);
  if (error) console.error("cancelInvite deleteUser failed:", error);
  refresh();
  return { status: "success", message: `The invitation for ${member.email} was cancelled.` };
}
