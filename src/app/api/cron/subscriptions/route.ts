import { timingSafeEqual } from "node:crypto";
import type { NextRequest } from "next/server";
import { deliverSubscriptionEvents } from "@/lib/subscription-emails";
import { billingToday } from "@/lib/subscription";
import { createAdminClient } from "@/lib/supabase/admin";

/** Bearer CRON_SECRET (the header Vercel Cron sends); no secret configured = always refused. */
function authorized(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const given = request.headers.get("authorization") ?? "";
  if (!secret) return false;
  const expected = Buffer.from(`Bearer ${secret}`);
  const actual = Buffer.from(given);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

/**
 * The daily subscription run (Phase 17, deliverable 9): issues invoices on the lead day, queues
 * reminders, marks past due, suspends after the grace days, refreshes health scores, then emails
 * what it queued. Idempotent for a date, so running it more than once a day is harmless.
 */
export async function GET(request: NextRequest) {
  if (!authorized(request)) return new Response("Unauthorized", { status: 401 });
  const { data, error } = await createAdminClient().rpc("run_subscription_cycle", { p_date: billingToday() });
  if (error) {
    console.error("run_subscription_cycle failed:", error);
    return Response.json({ ok: false }, { status: 500 });
  }
  const emails = await deliverSubscriptionEvents({ origin: process.env.NEXT_PUBLIC_APP_URL, limit: 500 });
  return Response.json({ ok: true, ...(data as object), emails });
}
