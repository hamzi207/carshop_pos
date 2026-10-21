import "server-only";
import { requireSuperadmin } from "@/lib/superadmin";
import { createAdminClient } from "@/lib/supabase/admin";

export type Plan = {
  id: string;
  name: string;
  code: string;
  description: string;
  visibility: "standard" | "custom";
  priceMonthly: number | null;
  priceYearly: number | null;
  maxStores: number | null;
  maxUsers: number | null;
  maxProducts: number | null;
  modules: string[] | null;
  trialDays: number;
  sortOrder: number;
  retiredAt: string | null;
  /** Organizations on it now. */
  organizations: number;
  /** The sign-up default (Platform settings). */
  isDefault: boolean;
};

const num = (v: number | string | null) => (v === null ? null : Number(v));

/** Every plan, retired ones last, with how many organizations use each (/admin/plans and the Subscription tab). */
export async function getPlans(): Promise<Plan[]> {
  await requireSuperadmin();
  const admin = createAdminClient();
  const [{ data: plans, error }, { data: subs }, { data: settings }] = await Promise.all([
    admin.from("subscription_plans").select("*").order("sort_order").order("name"),
    admin.from("tenant_subscriptions").select("plan_id"),
    admin.from("platform_settings").select("default_plan_id").maybeSingle(),
  ]);
  if (error) throw new Error(`subscription_plans: ${error.message}`);
  const counts = new Map<string, number>();
  for (const s of subs ?? []) counts.set(s.plan_id, (counts.get(s.plan_id) ?? 0) + 1);
  return (plans ?? [])
    .map((p) => ({
      id: p.id,
      name: p.name,
      code: p.code,
      description: p.description ?? "",
      visibility: p.visibility === "custom" ? ("custom" as const) : ("standard" as const),
      priceMonthly: num(p.price_monthly),
      priceYearly: num(p.price_yearly),
      maxStores: p.max_stores,
      maxUsers: p.max_users,
      maxProducts: p.max_products,
      modules: p.allowed_modules,
      trialDays: p.trial_days,
      sortOrder: p.sort_order,
      retiredAt: p.retired_at,
      organizations: counts.get(p.id) ?? 0,
      isDefault: settings?.default_plan_id === p.id,
    }))
    .sort((a, b) => Number(Boolean(a.retiredAt)) - Number(Boolean(b.retiredAt)));
}
