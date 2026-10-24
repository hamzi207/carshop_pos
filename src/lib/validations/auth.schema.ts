import { z } from "zod";

export const loginSchema = z.object({
  email: z.email("Enter a valid email address.").trim().toLowerCase(),
  password: z.string().min(1, "Enter your password."),
});

/** /reset-password: a new password, typed twice. */
export const newPasswordSchema = z
  .object({
    password: z.string().min(8, "Password must be at least 8 characters.").max(72, "Password must be 72 characters or fewer."),
    confirm: z.string(),
  })
  .refine((v) => v.password === v.confirm, { message: "The passwords don't match.", path: ["confirm"] });

export type LoginInput = z.infer<typeof loginSchema>;
export type NewPasswordInput = z.infer<typeof newPasswordSchema>;
