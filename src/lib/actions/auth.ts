"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isSuperadmin, PLATFORM_ADMIN_CLAIM, setPlatformAdminClaim } from "@/lib/superadmin";
import {
  loginSchema,
  newPasswordSchema,
  registerSchema,
  type LoginInput,
  type NewPasswordInput,
  type RegisterInput,
} from "@/lib/validations/auth.schema";

export type AuthActionResult =
  | { status: "error"; message: string }
  | { status: "confirm_email"; email: string };

function safeNext(next: string | null | undefined) {
  // Only allow same-site relative paths to avoid open redirects.
  return next && next.startsWith("/") && !next.startsWith("//") ? next : "/dashboard";
}

/**
 * Registers a new shop. The `on_auth_user_created_register_shop` database
 * trigger creates the `tenants` row and the linked admin `profiles` row in the
 * same transaction as the auth user, so the three always exist together.
 */
export async function registerShop(input: RegisterInput): Promise<AuthActionResult> {
  const parsed = registerSchema.safeParse(input);
  if (!parsed.success) {
    return { status: "error", message: parsed.error.issues[0]?.message ?? "Invalid details." };
  }
  const { shopName, fullName, email, password } = parsed.data;

  const origin =
    (await headers()).get("origin") ?? process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { shop_name: shopName, full_name: fullName },
      emailRedirectTo: `${origin}/auth/callback?next=/dashboard`,
    },
  });

  if (error) {
    if (error.code === "user_already_exists") {
      return { status: "error", message: "An account with this email already exists. Try signing in." };
    }
    if (error.code === "weak_password") {
      return { status: "error", message: error.message };
    }
    console.error("registerShop failed:", error);
    return { status: "error", message: "We couldn't create your shop. Please try again." };
  }

  // With email confirmation on, Supabase hides whether the email is taken by
  // returning a user with no identities.
  if (data.user && data.user.identities?.length === 0) {
    return { status: "error", message: "An account with this email already exists. Try signing in." };
  }

  if (!data.session) {
    return { status: "confirm_email", email };
  }

  redirect("/dashboard");
}

export async function signIn(input: LoginInput, next?: string): Promise<AuthActionResult> {
  const parsed = loginSchema.safeParse(input);
  if (!parsed.success) {
    return { status: "error", message: parsed.error.issues[0]?.message ?? "Invalid details." };
  }

  const supabase = await createClient();
  const { data: signedIn, error } = await supabase.auth.signInWithPassword(parsed.data);

  if (error) {
    // Deactivated in Settings → Team (the account is banned in Supabase Auth).
    if (error.code === "user_banned") {
      return { status: "error", message: "Your access to this shop has been turned off. Please ask your shop admin if you think this is a mistake." };
    }
    if (error.code === "email_not_confirmed") {
      return { status: "error", message: "Please confirm your email first — check your inbox for the link." };
    }
    return { status: "error", message: "Incorrect email or password." };
  }

  // Superadmin accounts have no shop: they sign in to the console (/admin/login), never here.
  if (await isSuperadmin(signedIn.user.id)) {
    await supabase.auth.signOut({ scope: "local" });
    return { status: "error", message: "This is a superadmin account. Sign in on the admin console's own sign-in page." };
  }

  // Suspended shops (Phase 13, set by a superadmin) and deactivated members can't sign in.
  const { data: shopStatus } = await supabase.rpc("my_shop_status");
  if (shopStatus === "deactivated") {
    await supabase.auth.signOut({ scope: "local" });
    return { status: "error", message: "Your access to this shop has been turned off. Please ask your shop admin if you think this is a mistake." };
  }
  if (shopStatus === "archived") {
    await supabase.auth.signOut({ scope: "local" });
    return { status: "error", message: "This organization has been archived. Please contact ProductLogik POS support." };
  }
  // Suspended for an unpaid subscription: signed in, but only the payment page opens.
  if (shopStatus === "unpaid") redirect("/subscription-due");
  if (shopStatus === "suspended") {
    // The superadmin's reason (Phase 17), read before signing out.
    const { data: reason } = await supabase.rpc("my_status_reason");
    await supabase.auth.signOut({ scope: "local" });
    return {
      status: "error",
      message: `This shop's account is paused, so signing in isn't possible right now.${reason ? ` Reason: ${reason.replace(/\.+$/, "")}.` : ""} Please contact ProductLogik POS support to reactivate it.`,
    };
  }

  redirect(safeNext(next));
}

/**
 * /admin/login: the superadmin console's own sign-in (Phase 17). Only platform_admins accounts get
 * in; shop accounts are refused. Next comes the two-factor code (/admin/mfa).
 */
export async function signInAdmin(input: LoginInput, next?: string): Promise<AuthActionResult> {
  const parsed = loginSchema.safeParse(input);
  if (!parsed.success) {
    return { status: "error", message: parsed.error.issues[0]?.message ?? "Invalid details." };
  }
  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error) {
    if (error.code === "user_banned") return { status: "error", message: "This superadmin account has been removed." };
    return { status: "error", message: "Incorrect email or password." };
  }
  if (!(await isSuperadmin(data.user.id))) {
    await supabase.auth.signOut({ scope: "local" });
    return { status: "error", message: "This isn't a superadmin account. Shop users sign in on the shop's sign-in page." };
  }
  // The routing hint in app_metadata (see superadmin.ts): set it if missing, then refresh so this session carries it.
  if (data.user.app_metadata?.[PLATFORM_ADMIN_CLAIM] !== true && (await setPlatformAdminClaim(data.user.id, true))) {
    await supabase.auth.refreshSession();
  }
  // Only same-site /admin paths: never an open redirect.
  const target = next && /^\/admin(\/|$|\?)/.test(next) ? next : "/admin";
  redirect(`/admin/mfa?next=${encodeURIComponent(target)}`);
}

/** /reset-password: sets the signed-in user's new password (after a one-time email link). */
export async function setNewPassword(input: NewPasswordInput): Promise<{ status: "error"; message: string }> {
  const parsed = newPasswordSchema.safeParse(input);
  if (!parsed.success) {
    return { status: "error", message: parsed.error.issues[0]?.message ?? "Check the password." };
  }
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  if (!claims?.claims) {
    return { status: "error", message: "This link has expired. Ask for a new one." };
  }
  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
  if (error) {
    if (error.code === "same_password") return { status: "error", message: "Choose a password different from your old one." };
    if (error.code === "weak_password") return { status: "error", message: error.message };
    console.error("setNewPassword failed:", error);
    return { status: "error", message: "We couldn't save your password. Please try again." };
  }
  // Invited superadmins choose their password here too; they go on to the console.
  redirect(claims.claims.app_metadata?.[PLATFORM_ADMIN_CLAIM] === true ? "/admin" : "/dashboard");
}

export async function signOut() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  await supabase.auth.signOut();
  // Each kind of account back to its own sign-in.
  redirect(data?.claims?.app_metadata?.[PLATFORM_ADMIN_CLAIM] === true ? "/admin/login" : "/login");
}
