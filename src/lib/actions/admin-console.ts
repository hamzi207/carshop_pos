"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { billingToday } from "@/lib/subscription";
import { appOrigin, passwordLink } from "@/lib/account-links";
import { sendTransactionalEmail } from "@/lib/email/send";
import { superadminInviteEmail } from "@/lib/email/templates/account";
import { audit, requireSuperadmin, setPlatformAdminClaim } from "@/lib/superadmin";
import { createAdminClient } from "@/lib/supabase/admin";
import type { AdminActionResult } from "./admin";
import { inviteTeamMember } from "./team";

// Phase 17 console tools: archive / restore, notes, tags and follow-ups (RF-17.2), the health
// score refresh (RF-17.4) and the platform team. Superadmin only, service role, audited.

const id = z.uuid();
const reasonOf = (v: string) => z.string().trim().min(3, "Say why (at least 3 characters).").max(500).safeParse(v);
const fail = (message: string): AdminActionResult => ({ status: "error", message });

// ---------------------------------------------------------------------------
// Archive / restore (never deleted)
// ---------------------------------------------------------------------------

/**
 * Archives the organization: its users are signed out and can't sign in, the daily billing run and
 * health score skip it, and all data is kept. Needs a reason and the organization's name typed.
 */
export async function archiveTenant(tenantId: string, reason: string, typedName: string): Promise<AdminActionResult> {
  const me = await requireSuperadmin();
  const why = reasonOf(reason);
  if (!why.success) return fail(why.error.issues[0]!.message);
  if (!id.safeParse(tenantId).success) return fail("That organization wasn't found.");
  const admin = createAdminClient();
  const { data: tenant } = await admin.from("tenants").select("name, archived_at").eq("id", tenantId).maybeSingle();
  if (!tenant) return fail("That organization wasn't found.");
  if (tenant.archived_at) return { status: "success", message: `${tenant.name} is already archived.` };
  if (typedName.trim().toLowerCase() !== tenant.name.trim().toLowerCase()) return fail("Type the organization's name exactly to confirm.");

  const { error } = await admin
    .from("tenants")
    .update({ archived_at: new Date().toISOString(), archived_by: me.userId, archive_reason: why.data, updated_at: new Date().toISOString() })
    .eq("id", tenantId)
    .is("archived_at", null);
  if (error) {
    console.error("archiveTenant failed:", error);
    return fail("We couldn't archive the organization. Please try again.");
  }
  // Sign everyone out now (RLS already refuses them from the next request).
  const { data: members } = await admin.from("profiles").select("id").eq("tenant_id", tenantId);
  await Promise.all((members ?? []).map((m) => admin.rpc("admin_force_sign_out", { p_user: m.id })));
  await admin.from("impersonation_sessions").update({ ended_at: new Date().toISOString() }).eq("tenant_id", tenantId).is("ended_at", null);
  await audit({ adminId: me.userId, action: "tenant.archive", tenantId, reason: why.data, details: { shop: tenant.name, users: members?.length ?? 0 } });
  refresh();
  return { status: "success", message: `${tenant.name} is archived and its users were signed out. Restore it at any time.` };
}

/** Restores an archived organization as it was (status, users, subscription). */
export async function restoreTenant(tenantId: string, reason: string): Promise<AdminActionResult> {
  const me = await requireSuperadmin();
  const why = reasonOf(reason);
  if (!why.success) return fail(why.error.issues[0]!.message);
  if (!id.safeParse(tenantId).success) return fail("That organization wasn't found.");
  const admin = createAdminClient();
  const { data: tenant } = await admin.from("tenants").select("name, archived_at, archive_reason").eq("id", tenantId).maybeSingle();
  if (!tenant) return fail("That organization wasn't found.");
  if (!tenant.archived_at) return { status: "success", message: `${tenant.name} isn't archived.` };
  const { error } = await admin
    .from("tenants")
    .update({ archived_at: null, archived_by: null, archive_reason: null, updated_at: new Date().toISOString() })
    .eq("id", tenantId);
  if (error) {
    console.error("restoreTenant failed:", error);
    return fail("We couldn't restore the organization. Please try again.");
  }
  await audit({
    adminId: me.userId,
    action: "tenant.restore",
    tenantId,
    reason: why.data,
    details: { shop: tenant.name, archivedAt: tenant.archived_at, archiveReason: tenant.archive_reason },
  });
  refresh();
  return { status: "success", message: `${tenant.name} is back. Its users can sign in again.` };
}

// ---------------------------------------------------------------------------
// RF-17.2: notes, tags, follow-ups (never shown to the organization)
// ---------------------------------------------------------------------------

const noteBody = z.string().trim().min(1, "Write the note.").max(4000, "Keep the note under 4,000 characters.");

export async function addTenantNote(tenantId: string, body: string): Promise<AdminActionResult> {
  const me = await requireSuperadmin();
  const v = noteBody.safeParse(body);
  if (!v.success) return fail(v.error.issues[0]!.message);
  if (!id.safeParse(tenantId).success) return fail("That organization wasn't found.");
  const { error } = await createAdminClient().from("tenant_notes").insert({ tenant_id: tenantId, body: v.data, author_id: me.userId });
  if (error) {
    console.error("addTenantNote failed:", error);
    return fail("We couldn't save the note. Please try again.");
  }
  refresh();
  return { status: "success" };
}

/** Only the note's author edits it; the edit time is shown. */
export async function editTenantNote(noteId: string, body: string): Promise<AdminActionResult> {
  const me = await requireSuperadmin();
  const v = noteBody.safeParse(body);
  if (!v.success) return fail(v.error.issues[0]!.message);
  if (!id.safeParse(noteId).success) return fail("That note wasn't found.");
  const { data, error } = await createAdminClient()
    .from("tenant_notes")
    .update({ body: v.data, edited_at: new Date().toISOString() })
    .eq("id", noteId)
    .eq("author_id", me.userId)
    .is("deleted_at", null)
    .select("id");
  if (error) {
    console.error("editTenantNote failed:", error);
    return fail("We couldn't save the note. Please try again.");
  }
  if (!data?.length) return fail("Only the note's author can edit it.");
  refresh();
  return { status: "success" };
}

/** Hidden, not erased: the note and the reason stay in the table and the audit log. */
export async function deleteTenantNote(noteId: string, reason: string): Promise<AdminActionResult> {
  const me = await requireSuperadmin();
  const why = z.string().trim().min(3, "Say why (at least 3 characters).").max(300).safeParse(reason);
  if (!why.success) return fail(why.error.issues[0]!.message);
  if (!id.safeParse(noteId).success) return fail("That note wasn't found.");
  const admin = createAdminClient();
  const { data: note } = await admin.from("tenant_notes").update({ deleted_at: new Date().toISOString(), deleted_reason: why.data }).eq("id", noteId).is("deleted_at", null).select("tenant_id, body").maybeSingle();
  if (!note) return fail("That note wasn't found.");
  await audit({ adminId: me.userId, action: "tenant.note_delete", tenantId: note.tenant_id, reason: why.data, details: { note: note.body.slice(0, 200) } });
  refresh();
  return { status: "success" };
}

const tagSchema = z.object({
  name: z.string().trim().min(1, "Name the tag.").max(30, "Keep tag names under 30 characters."),
  color: z.string().regex(/^#[0-9a-f]{6}$/, "Pick a colour."),
});

export async function createAdminTag(name: string, color: string): Promise<AdminActionResult & { id?: string }> {
  const me = await requireSuperadmin();
  const v = tagSchema.safeParse({ name, color: color.toLowerCase() });
  if (!v.success) return fail(v.error.issues[0]!.message);
  const { data, error } = await createAdminClient().from("admin_tags").insert(v.data).select("id").single();
  if (error) {
    if (error.code === "23505") return fail(`There's already a tag called “${v.data.name}”.`);
    console.error("createAdminTag failed:", error);
    return fail("We couldn't add the tag. Please try again.");
  }
  await audit({ adminId: me.userId, action: "tag.create", details: v.data });
  refresh();
  return { status: "success", id: data.id };
}

/** Removes the tag everywhere. */
export async function deleteAdminTag(tagId: string): Promise<AdminActionResult> {
  const me = await requireSuperadmin();
  if (!id.safeParse(tagId).success) return fail("That tag wasn't found.");
  const { data, error } = await createAdminClient().from("admin_tags").delete().eq("id", tagId).select("name").maybeSingle();
  if (error || !data) return fail("That tag wasn't found.");
  await audit({ adminId: me.userId, action: "tag.delete", details: { name: data.name } });
  refresh();
  return { status: "success" };
}

/** Sets exactly these tags on the organization. */
export async function setTenantTags(tenantId: string, tagIds: string[]): Promise<AdminActionResult> {
  await requireSuperadmin();
  if (!id.safeParse(tenantId).success || !z.array(id).max(30).safeParse(tagIds).success) return fail("Those tags aren't valid.");
  const admin = createAdminClient();
  const wanted = [...new Set(tagIds)];
  const { error: delError } = await admin
    .from("tenant_tags")
    .delete()
    .eq("tenant_id", tenantId)
    .not("tag_id", "in", `(${wanted.length ? wanted.join(",") : "00000000-0000-0000-0000-000000000000"})`);
  const { error } = wanted.length
    ? await admin.from("tenant_tags").upsert(wanted.map((tag_id) => ({ tenant_id: tenantId, tag_id })), { onConflict: "tenant_id,tag_id", ignoreDuplicates: true })
    : { error: null };
  if (delError || error) {
    console.error("setTenantTags failed:", delError ?? error);
    return fail("We couldn't save the tags. Please try again.");
  }
  refresh();
  return { status: "success" };
}

const followUpSchema = z.object({
  dueOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick a date."),
  reason: z.string().trim().min(1, "Say what to follow up on.").max(300),
});

export async function addFollowUp(tenantId: string, dueOn: string, reason: string): Promise<AdminActionResult> {
  const me = await requireSuperadmin();
  const v = followUpSchema.safeParse({ dueOn, reason });
  if (!v.success) return fail(v.error.issues[0]!.message);
  if (!id.safeParse(tenantId).success) return fail("That organization wasn't found.");
  if (v.data.dueOn < billingToday()) return fail("Pick today or a later date.");
  const { error } = await createAdminClient().from("tenant_follow_ups").insert({ tenant_id: tenantId, due_on: v.data.dueOn, reason: v.data.reason, created_by: me.userId });
  if (error) {
    console.error("addFollowUp failed:", error);
    return fail("We couldn't add the follow-up. Please try again.");
  }
  refresh();
  return { status: "success" };
}

/** Done (or undone, to reopen it). */
export async function setFollowUpDone(followUpId: string, done: boolean): Promise<AdminActionResult> {
  const me = await requireSuperadmin();
  if (!id.safeParse(followUpId).success) return fail("That follow-up wasn't found.");
  const { error } = await createAdminClient()
    .from("tenant_follow_ups")
    .update(done ? { done_at: new Date().toISOString(), done_by: me.userId } : { done_at: null, done_by: null })
    .eq("id", followUpId);
  if (error) return fail("We couldn't update the follow-up. Please try again.");
  refresh();
  return { status: "success" };
}

// ---------------------------------------------------------------------------
// RF-17.4: health score
// ---------------------------------------------------------------------------

/** Today's health snapshot for every live organization (the daily run does the same). */
export async function refreshHealthScores(): Promise<AdminActionResult> {
  await requireSuperadmin();
  const { data, error } = await createAdminClient().rpc("admin_refresh_health", { p_date: billingToday() });
  if (error) {
    console.error("refreshHealthScores failed:", error);
    return fail("We couldn't refresh the health scores. Please try again.");
  }
  refresh();
  return { status: "success", message: `${data ?? 0} organizations scored.` };
}

// ---------------------------------------------------------------------------
// Platform team
// ---------------------------------------------------------------------------

/** The platform admin's row, or null. */
async function platformAdmin(userId: string) {
  const { data } = await createAdminClient().from("platform_admins").select("id, full_name, email, removed_at").eq("id", userId).maybeSingle();
  return data;
}

/**
 * Platform team → Add superadmin. Superadmins are their own accounts, never a shop's: this creates
 * the account and emails an invitation to choose a password (sign-in at /admin/login, then a
 * two-factor app). An email that already has a shop account is refused; a removed superadmin is
 * brought back.
 */
export async function addSuperadmin(fullName: string, email: string): Promise<AdminActionResult> {
  const me = await requireSuperadmin();
  const name = z.string().trim().min(2, "Enter their name.").max(120).safeParse(fullName);
  if (!name.success) return fail(name.error.issues[0]!.message);
  const v = z.email("Enter a valid email.").safeParse(email.trim().toLowerCase());
  if (!v.success) return fail(v.error.issues[0]!.message);
  const admin = createAdminClient();

  const { data: existing } = await admin.from("platform_admins").select("id, full_name, removed_at").ilike("email", v.data).maybeSingle();
  if (existing && !existing.removed_at) return { status: "success", message: `${existing.full_name} is already a superadmin.` };
  if (existing) {
    const { error } = await admin.rpc("admin_set_platform_admin", { p_user: existing.id, p_active: true, p_by: me.userId });
    if (error) {
      console.error("addSuperadmin (restore) failed:", error);
      return fail("We couldn't restore their access. Please try again.");
    }
    await admin.auth.admin.updateUserById(existing.id, { ban_duration: "none" });
    await setPlatformAdminClaim(existing.id, true);
    await audit({ adminId: me.userId, action: "superadmin.grant", userId: existing.id, details: { email: v.data, restored: true } });
    refresh();
    return { status: "success", message: `${existing.full_name} is a superadmin again and can sign in at /admin/login.` };
  }

  const { data: shopUser } = await admin.from("profiles").select("id").ilike("email", v.data).maybeSingle();
  if (shopUser) {
    return fail(`${v.data} belongs to a shop account. Superadmins need their own email (for Gmail, name+admin@gmail.com reaches the same inbox).`);
  }
  const { data: link, error } = await admin.auth.admin.generateLink({ type: "invite", email: v.data, options: { data: { full_name: name.data } } });
  if (error || !link.user) {
    if (error?.code === "email_exists" || /already been registered|already exists/i.test(error?.message ?? "")) {
      return fail(`${v.data} already has an account. Superadmins need their own email.`);
    }
    console.error("addSuperadmin invite failed:", error);
    return fail("We couldn't create the account. Please try again.");
  }
  const { error: rowError } = await admin.rpc("admin_set_platform_admin", {
    p_user: link.user.id,
    p_active: true,
    p_by: me.userId,
    p_full_name: name.data,
    p_email: v.data,
  });
  if (rowError) {
    console.error("addSuperadmin row failed:", rowError);
    await admin.auth.admin.deleteUser(link.user.id);
    return fail("We couldn't create the account. Please try again.");
  }
  await setPlatformAdminClaim(link.user.id, true);

  const origin = await appOrigin();
  const sent = await sendTransactionalEmail({
    template: "superadmin_invite",
    to: v.data,
    content: superadminInviteEmail({
      fullName: name.data,
      inviterName: me.fullName,
      setPasswordUrl: passwordLink(origin, link.properties.hashed_token, "invite"),
      loginUrl: `${origin}/admin/login`,
    }),
    tenantId: null,
    sentBy: me.userId,
  });
  await audit({ adminId: me.userId, action: "superadmin.grant", userId: link.user.id, details: { email: v.data, invitation: sent.status } });
  refresh();
  return {
    status: "success",
    message:
      sent.status === "failed"
        ? `${name.data}'s account was created, but the invitation couldn't be sent. Remove and add them again to retry.`
        : sent.status === "logged"
          ? `${name.data}'s account was created. Email isn't set up on this server, so the invitation was printed to the server console.`
          : `${name.data} was emailed an invitation to choose a password. They set up a two-factor app at their first sign-in.`,
  };
}

/**
 * Removes a superadmin: their account can't sign in any more (their name stays on the audit log).
 * Needs their email typed; the last superadmin can't be removed, and nobody removes themselves.
 */
export async function removeSuperadmin(userId: string, typedEmail: string): Promise<AdminActionResult> {
  const me = await requireSuperadmin();
  if (!id.safeParse(userId).success) return fail("That superadmin wasn't found.");
  if (userId === me.userId) return fail("Ask another superadmin to remove you.");
  const user = await platformAdmin(userId);
  if (!user || user.removed_at) return fail("That superadmin wasn't found.");
  if (typedEmail.trim().toLowerCase() !== user.email.toLowerCase()) return fail("Type their email exactly to confirm.");
  const admin = createAdminClient();
  const { error } = await admin.rpc("admin_set_platform_admin", { p_user: userId, p_active: false, p_by: me.userId });
  if (error) {
    if (error.code === "22023") return fail("The last superadmin can't be removed.");
    console.error("removeSuperadmin failed:", error);
    return fail("We couldn't remove their access. Please try again.");
  }
  await setPlatformAdminClaim(userId, false);
  // About 100 years: they can't sign in; adding them again lifts it.
  await admin.auth.admin.updateUserById(userId, { ban_duration: "876000h" });
  await admin.rpc("admin_force_sign_out", { p_user: userId });
  await audit({ adminId: me.userId, action: "superadmin.revoke", userId, details: { email: user.email } });
  refresh();
  return { status: "success", message: `${user.full_name} is no longer a superadmin and was signed out.` };
}

/**
 * Removes another superadmin's two-factor app (they lost their phone) and signs them out. At their
 * next sign-in they set up a new one before the console opens. Needs their email typed.
 */
export async function resetTwoFactor(userId: string, typedEmail: string): Promise<AdminActionResult> {
  const me = await requireSuperadmin();
  if (!id.safeParse(userId).success) return fail("That superadmin wasn't found.");
  if (userId === me.userId) return fail("Ask another superadmin to reset your two-factor sign-in.");
  const user = await platformAdmin(userId);
  if (!user || user.removed_at) return fail("That superadmin wasn't found.");
  if (typedEmail.trim().toLowerCase() !== user.email.toLowerCase()) return fail("Type their email exactly to confirm.");
  const admin = createAdminClient();
  const { data, error } = await admin.auth.admin.mfa.listFactors({ userId });
  if (error) {
    console.error("resetTwoFactor list failed:", error);
    return fail("We couldn't read their two-factor setup. Please try again.");
  }
  for (const factor of data.factors) {
    const { error: delError } = await admin.auth.admin.mfa.deleteFactor({ userId, id: factor.id });
    if (delError) {
      console.error("resetTwoFactor delete failed:", delError);
      return fail("We couldn't remove their two-factor app. Please try again.");
    }
  }
  await admin.rpc("admin_force_sign_out", { p_user: userId });
  await audit({ adminId: me.userId, action: "superadmin.mfa_reset", userId, details: { email: user.email, factors: data.factors.length } });
  return {
    status: "success",
    message: data.factors.length
      ? `${user.full_name}'s two-factor app was removed and they were signed out. They'll set up a new one at their next sign-in.`
      : `${user.full_name} had no two-factor app set up.`,
  };
}

/**
 * Deletes a user's account for good (Phase 17). Their quotations, invoices and payments stay in the
 * organization, shown without a name. Not for the owner
 * (transfer first) or the organization's last active admin. Needs their email typed.
 */
export async function deleteUserAccount(userId: string, typedEmail: string): Promise<AdminActionResult> {
  const me = await requireSuperadmin();
  if (!id.safeParse(userId).success) return fail("That user wasn't found.");
  if (userId === me.userId) return fail("You can't delete your own account.");
  const admin = createAdminClient();
  const { data: user } = await admin.from("profiles").select("full_name, email, role, tenant_id, deactivated_at").eq("id", userId).maybeSingle();
  if (!user) return fail("That user wasn't found.");
  if (typedEmail.trim().toLowerCase() !== user.email.toLowerCase()) return fail("Type the user's email exactly to confirm.");
  const { data: tenant } = await admin.from("tenants").select("owner_id").eq("id", user.tenant_id).maybeSingle();
  if (tenant?.owner_id === userId) return fail(`${user.full_name} owns the organization. Make another admin the owner first.`);
  if (user.role === "admin" && !user.deactivated_at) {
    const { count } = await admin
      .from("profiles")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", user.tenant_id)
      .eq("role", "admin")
      .is("deactivated_at", null)
      .neq("id", userId);
    if (!count) return fail(`${user.full_name} is the organization's only active admin. Make someone else admin first.`);
  }
  const { error } = await admin.auth.admin.deleteUser(userId);
  if (error) {
    console.error("deleteUserAccount failed:", error);
    return fail("We couldn't delete the account. Please try again.");
  }
  await audit({ adminId: me.userId, action: "user.delete", tenantId: user.tenant_id, details: { email: user.email, name: user.full_name, role: user.role } });
  refresh();
  return { status: "success", message: `${user.full_name}'s account was deleted. Their documents stay in the organization.` };
}

export type BulkUserRow = { fullName: string; email: string; role: string };
export type BulkUserResult = { email: string; ok: boolean; message: string };

/**
 * Users tab → Import CSV (Phase 17, deliverable 2): invites each row into the organization through
 * the same action as one invite (plan limits, existing-account checks, invitation email). Up to 50 rows.
 */
export async function bulkInviteUsers(tenantId: string, rows: BulkUserRow[]): Promise<{ status: "error"; message: string } | { status: "success"; results: BulkUserResult[] }> {
  await requireSuperadmin();
  if (!id.safeParse(tenantId).success) return { status: "error", message: "That organization wasn't found." };
  if (!Array.isArray(rows) || rows.length === 0) return { status: "error", message: "The file has no rows." };
  if (rows.length > 50) return { status: "error", message: "Up to 50 users per file." };
  const results: BulkUserResult[] = [];
  // One at a time: each invite checks the plan's user limit against the ones before it.
  for (const r of rows) {
    const role = String(r.role ?? "").trim().toLowerCase();
    const result = await inviteTeamMember({ fullName: String(r.fullName ?? ""), email: String(r.email ?? ""), role: (role === "admin" ? "admin" : role === "staff" || role === "" ? "staff" : role) as "admin" | "staff" }, tenantId);
    results.push({ email: String(r.email ?? ""), ok: result.status === "success", message: result.message ?? "Invited." });
  }
  return { status: "success", results };
}
