import Link from "next/link";
import { AlertTriangle, CalendarClock } from "lucide-react";
import { getShopSession } from "@/lib/auth";
import { getMySubscription } from "@/lib/my-subscription-data";
import { addDays, billingDate, billingToday, daysBetween, pkr } from "@/lib/subscription";

/** Days ahead that a due date or trial end is announced (the first reminder email). */
const NOTICE_DAYS = 7;

/**
 * Admins only: the subscription is due soon, past due, ending, or the organization is over a plan
 * limit (Phase 17, deliverable 9). Reads the session: render inside <Suspense>.
 */
export async function SubscriptionBanner() {
  const { role } = await getShopSession();
  if (role !== "admin") return null;
  const data = await getMySubscription();
  const s = data?.subscription;
  if (!data || !s) return null;

  const today = billingToday();
  const open = data.invoices.find((i) => i.status === "unpaid" || i.status === "partly_paid");
  const owed = open ? pkr(open.total - open.amountPaid) : null;
  const over = (["users", "products", "stores"] as const).filter((k) => s.limits[k] !== null && s.usage[k] > s.limits[k]!);

  let tone: "danger" | "warning" = "warning";
  let message: string | null = null;
  if (s.status === "past_due") {
    tone = "danger";
    message = `Your subscription is past due${open ? `: ${owed} on invoice ${open.number}` : ""}. Please pay by ${billingDate(addDays(s.nextDueDate ?? today, s.graceDays))} to avoid a pause.`;
  } else if (s.cancelAt && daysBetween(today, s.cancelAt) <= NOTICE_DAYS) {
    message = `Your subscription ends after ${billingDate(s.cancelAt)}.`;
  } else if (open && daysBetween(today, open.dueDate) <= NOTICE_DAYS) {
    const days = daysBetween(today, open.dueDate);
    message = `Your subscription is due ${days <= 0 ? "today" : `on ${billingDate(open.dueDate)}`}: ${owed}, invoice ${open.number}.`;
  } else if (s.status === "trial" && s.trialEndsAt && daysBetween(today, s.trialEndsAt) <= NOTICE_DAYS) {
    message = `Your free trial ends on ${billingDate(s.trialEndsAt)}.`;
  } else if (over.length > 0) {
    const k = over[0];
    message = `Your plan allows ${s.limits[k]!.toLocaleString("en-PK")} ${k}, and you have ${s.usage[k].toLocaleString("en-PK")}. Nothing is removed, but you can't add more ${k} until you're under the limit or change plans.`;
  }
  if (!message) return null;

  return (
    <div className={`subscription-banner is-${tone}`} role="status">
      {tone === "danger" ? <AlertTriangle size={16} aria-hidden /> : <CalendarClock size={16} aria-hidden />}
      <p>{message}</p>
      <Link href="/settings/subscription" className="button">Open Subscription</Link>
    </div>
  );
}
