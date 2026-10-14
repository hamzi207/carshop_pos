"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  loginSchema,
  registerSchema,
  type LoginInput,
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
  const { error } = await supabase.auth.signInWithPassword(parsed.data);

  if (error) {
    if (error.code === "email_not_confirmed") {
      return { status: "error", message: "Please confirm your email first — check your inbox for the link." };
    }
    return { status: "error", message: "Incorrect email or password." };
  }

  redirect(safeNext(next));
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
