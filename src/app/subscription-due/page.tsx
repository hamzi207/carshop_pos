import { Suspense } from "react";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { LogOut, PauseCircle } from "lucide-react";
import { BrandLockup } from "@/components/shared/brand";
import { PayToCard, SubscriptionInvoices } from "@/components/subscription/subscription-summary";
import { signOut } from "@/lib/actions/auth";
import { getMySubscription } from "@/lib/my-subscription-data";
import { pkr } from "@/lib/subscription";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Subscription due" };

async function Due() {
  const supabase = await createClient();
  const { data: status } = await supabase.rpc("my_shop_status");
  if (status !== "unpaid") redirect("/dashboard");
  const { data: notice } = await supabase.rpc("my_unpaid_notice");
  const n = (notice ?? {}) as { tenantName?: string; reason?: string; isAdmin?: boolean; amountDue?: number };
  const ended = n.reason === "Subscription ended";
  const data = n.isAdmin ? await getMySubscription() : null;
  const due = Number(n.amountDue ?? 0);

  return (
    <>
      <section className="card due-hero">
        <span className="header-icon danger"><PauseCircle size={20} /></span>
        <div>
          <h1>{n.tenantName ?? "Your organization"} is paused</h1>
          <p>
            {ended
              ? "The subscription has ended. Your data is kept. Contact ProductLogik to start again."
              : `The subscription wasn't paid${due > 0 ? `: ${pkr(due)} is due` : ""}. Your data is safe, and everything works again as soon as the payment is confirmed.`}
          </p>
          {!n.isAdmin && <p>Please ask your organization&apos;s admin to pay or report the payment.</p>}
        </div>
      </section>
      {data && !ended && (
        <>
          <SubscriptionInvoices data={data} />
          <PayToCard data={data} />
        </>
      )}
    </>
  );
}

/** Suspended for an unpaid subscription (Phase 17, deliverable 9): what's due and how to pay, instead of the app. */
export default function SubscriptionDuePage() {
  return (
    <div className="due-shell">
      <header className="due-header">
        <BrandLockup tone="light" />
        <form action={signOut}>
          <button type="submit" className="button"><LogOut size={14} /> Sign Out</button>
        </form>
      </header>
      <main className="page">
        <Suspense fallback={<section className="card"><div className="empty-state">Loading…</div></section>}>
          <Due />
        </Suspense>
      </main>
    </div>
  );
}
