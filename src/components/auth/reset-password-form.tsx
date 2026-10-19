"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2, Lock } from "lucide-react";
import { setNewPassword } from "@/lib/actions/auth";
import { newPasswordSchema, type NewPasswordInput } from "@/lib/validations/auth.schema";
import { FormField } from "./form-field";

export function ResetPasswordForm() {
  const [serverError, setServerError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<NewPasswordInput>({
    resolver: zodResolver(newPasswordSchema),
    defaultValues: { password: "", confirm: "" },
  });

  const onSubmit = handleSubmit(async (values) => {
    setServerError(null);
    // On success the action redirects to the dashboard and this never resolves.
    const result = await setNewPassword(values);
    if (result.status === "error") setServerError(result.message);
  });

  return (
    <form className="auth-form" onSubmit={onSubmit} noValidate>
      {serverError && (
        <div className="form-alert form-alert-error" role="alert">
          {serverError}
        </div>
      )}
      <FormField
        id="password"
        type="password"
        label="NEW PASSWORD"
        icon={<Lock size={16} />}
        placeholder="At least 8 characters"
        autoComplete="new-password"
        error={errors.password?.message}
        {...register("password")}
      />
      <FormField
        id="confirm"
        type="password"
        label="TYPE IT AGAIN"
        icon={<Lock size={16} />}
        placeholder="The same password"
        autoComplete="new-password"
        error={errors.confirm?.message}
        {...register("confirm")}
      />
      <button type="submit" className="button button-primary auth-submit" disabled={isSubmitting}>
        {isSubmitting && <Loader2 size={16} className="animate-spin" />}
        {isSubmitting ? "Saving…" : "Save password and sign in"}
      </button>
    </form>
  );
}
