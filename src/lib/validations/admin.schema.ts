import { z } from "zod";

/** tenants.status (Phase 12). Suspended shops can't sign in. */
export const TENANT_STATUSES = ["active", "trial", "suspended"] as const;
export type TenantStatus = (typeof TENANT_STATUSES)[number];

export const TENANT_STATUS_LABEL: Record<TenantStatus, string> = {
  active: "Active",
  trial: "Trial",
  suspended: "Suspended",
};

/** /admin/tenants → Create Organization. Same limits as the sign-up form. */
export const createOrganizationSchema = z.object({
  shopName: z.string().trim().min(2, "Shop name must be at least 2 characters.").max(80, "Shop name must be 80 characters or fewer."),
  fullName: z.string().trim().min(2, "Enter the owner's full name.").max(80, "Name must be 80 characters or fewer."),
  email: z.email("Enter a valid email address.").trim().toLowerCase(),
  phone: z.string().trim().max(30).optional().default(""),
  status: z.enum(["active", "trial"]).default("active"),
  /** Phase 17: the subscription plan and cycle ("" = the sign-up default plan). */
  planId: z.union([z.literal(""), z.uuid("Choose a plan.")]).default(""),
  cycle: z.enum(["monthly", "yearly"]).default("monthly"),
  /** How the owner first signs in: an emailed link, or a temporary password shown once. */
  access: z.enum(["email", "password"]).default("email"),
});

export type CreateOrganizationInput = z.input<typeof createOrganizationSchema>;
