"use client";

import { useState } from "react";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2, Lock, Mail, Store, User } from "lucide-react";
import { registerShop } from "@/lib/actions/auth";
import { registerSchema, type RegisterInput } from "@/lib/validations/auth.schema";
import { FormField } from "./form-field";

export function RegisterForm() {
  const [serverError, setServerError] = useState<string | null>(null);
  const [confirmEmail, setConfirmEmail] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<RegisterInput>({
    resolver: zodResolver(registerSchema),
    defaultValues: { shopName: "", fullName: "", email: "", password: "" },
  });

  const onSubmit = handleSubmit(async (values) => {
    setServerError(null);
    // On success the action redirects to /dashboard and this never resolves.
    const result = await registerShop(values);
    if (result.status === "error") setServerError(result.message);
    if (result.status === "confirm_email") setConfirmEmail(result.email);
  });

  if (confirmEmail) {
    return (
      <div className="auth-form">
        <div className="form-alert form-alert-success" role="status">
          Your shop has been created. We sent a confirmation link to <strong>{confirmEmail}</strong>{" "}
          — click it to activate your account and sign in.
        </div>
        <Link href="/login" className="button button-primary auth-submit">
          Go to sign in
        </Link>
      </div>
    );
  }

  return (
    <form className="auth-form" onSubmit={onSubmit} noValidate>
      {serverError && (
        <div className="form-alert form-alert-error" role="alert">
          {serverError}
        </div>
      )}
      <FormField
        id="shopName"
        label="SHOP NAME"
        icon={<Store size={16} />}
        placeholder="e.g. Apex Auto Accessories"
        autoComplete="organization"
        error={errors.shopName?.message}
        {...register("shopName")}
      />
      <FormField
        id="fullName"
        label="YOUR NAME"
        icon={<User size={16} />}
        placeholder="e.g. Marcus Vance"
        autoComplete="name"
        error={errors.fullName?.message}
        {...register("fullName")}
      />
      <FormField
        id="email"
        type="email"
        label="WORK EMAIL"
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
        placeholder="At least 8 characters"
        autoComplete="new-password"
        error={errors.password?.message}
        {...register("password")}
      />
      <button type="submit" className="button button-primary auth-submit" disabled={isSubmitting}>
        {isSubmitting && <Loader2 size={16} className="animate-spin" />}
        {isSubmitting ? "Creating your shop…" : "Register Shop"}
      </button>
    </form>
  );
}
