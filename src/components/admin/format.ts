import { formatMoney } from "@/lib/format";
import { DEFAULT_TIMEZONE } from "@/lib/timezones";
import { TENANT_STATUS_LABEL, type TenantStatus } from "@/lib/validations/admin.schema";

// Shared by the /admin pages: platform times are shown in Pakistan time, money in whole units.

export const adminDate = (value: string | null) =>
  value ? new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeZone: DEFAULT_TIMEZONE }).format(new Date(value)) : "Never";

export const adminDateTime = (value: string) =>
  new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: DEFAULT_TIMEZONE }).format(new Date(value));

export const adminMoney = (amount: number, currency: string) => formatMoney(amount, { currency, showPaisa: false });

const STATUS_TONE: Record<TenantStatus, string> = { active: "badge-green", trial: "badge-blue", suspended: "badge-red" };

export function statusBadge(status: string) {
  const s = (status in STATUS_TONE ? status : "active") as TenantStatus;
  return { label: TENANT_STATUS_LABEL[s], tone: `badge ${STATUS_TONE[s]}` };
}

/** One audit row in words, for the activity lists. */
export function describeAction(action: string, details: Record<string, unknown>) {
  const d = (k: string) => (typeof details[k] === "string" || typeof details[k] === "number" ? String(details[k]) : "");
  switch (action) {
    case "impersonation.start":
      return "Started acting as the shop (Login As)";
    case "impersonation.end":
      return `Left the shop after ${d("minutes") || "0"} min`;
    case "impersonation.request":
      return `Changed something while acting as the shop (${d("method")} ${d("path")})`;
    case "tenant.create":
      return `Created the shop, owner ${d("owner")}`;
    case "tenant.update":
      return `Edited company details (${Object.keys((details.after as object) ?? {}).join(", ") || "no changes"})`;
    case "tenant.status":
      return `Status ${d("before")} → ${d("after")}`;
    case "tenant.logo":
      return "Uploaded a new logo";
    case "tenant.logo_removed":
      return "Removed the logo";
    case "user.password_reset_email":
      return `Sent a password reset email to ${d("email")}`;
    case "user.temporary_password":
      return `Set a temporary password for ${d("email")}`;
    case "user.role":
      return `${d("email")}: role ${d("before")} → ${d("after")}`;
    default:
      return action;
  }
}
