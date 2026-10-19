import { z } from "zod";

// Settings → Team (Phase 14).

export const TEAM_ROLES = ["staff", "admin"] as const;
export type TeamRole = (typeof TEAM_ROLES)[number];
export const TEAM_ROLE_LABEL: Record<TeamRole, string> = { admin: "Admin", staff: "Staff" };

export const teamInviteSchema = z.object({
  fullName: z.string().trim().min(2, "Enter their name.").max(120, "Name must be 120 characters or fewer."),
  email: z.string().trim().toLowerCase().pipe(z.email("Enter a valid email address.").max(200)),
  role: z.enum(TEAM_ROLES, { error: "Choose Staff or Admin." }),
});
export type TeamInviteInput = z.input<typeof teamInviteSchema>;
