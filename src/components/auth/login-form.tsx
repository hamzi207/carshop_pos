"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2, Lock, Mail } from "lucide-react";
import { signIn } from "@/lib/actions/auth";
import { loginSchema, type LoginInput } from "@/lib/validations/auth.schema";
import { FormField } from "./form-field";

const QUERY_ERRORS: Record<string, string> = {
  confirmation_failed: "That confirmation link is invalid or has expired. Try signing in or registering again.",
  no_shop: "Your account isn't linked to a shop yet. Please contact your shop admin.",
  link_expired: "That link is invalid or has expired. Ask for a new one.",
  deactivated: "Your access to this shop has been turned off. Please ask your shop admin if you think this is a mistake.",
  suspended: "This shop's account is paused, so signing in isn't possible right now. Please contact CarShop POS support to reactivate it.",
};

export function LoginForm() {
  const searchParams = useSearchParams();
  const next = searchParams.get("next") ?? undefined;
  const queryError = QUERY_ERRORS[searchParams.get("error") ?? ""] ?? null;
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginInput>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "", password: "" },
  });

  const onSubmit = handleSubmit(async (values) => {
    setServerError(null);
    // On success the action redirects and this never resolves.
    const result = await signIn(values, next);
    if (result.status === "error") setServerError(result.message);
  });

  const alert = serverError ?? queryError;

  return (
    <form className="auth-form" onSubmit={onSubmit} noValidate>
      {alert && (
        <div className="form-alert form-alert-error" role="alert">
          {alert}
        </div>
      )}
      <FormField
        id="email"
        type="email"
        label="EMAIL"
        icon={<Mail size={16} />}
        placeholder="you@yourshop.com"
        autoComplete="email"
        error={errors.email?.message}
        {...register("email")}
      />
      <FormField
        id="password"
        type="password"
        label="PASSWORD"
        icon={<Lock size={16} />}
        placeholder="Your password"
        autoComplete="current-password"
        error={errors.password?.message}
        {...register("password")}
      />
      <button type="submit" className="button button-primary auth-submit" disabled={isSubmitting}>
        {isSubmitting && <Loader2 size={16} className="animate-spin" />}
        {isSubmitting ? "Signing in…" : "Sign in"}
      </button>
    </form>
  );
}
