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
});

export type CreateOrganizationInput = z.input<typeof createOrganizationSchema>;
