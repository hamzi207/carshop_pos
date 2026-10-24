// Industry onboarding checklist (RF-18.3). Each industry lists its steps in order (industries.onboarding_steps,
// edited in /admin/industries); private.onboarding_status() works out which are done from the organization's
// own data. A step for a later phase's feature (stores, opening balances) is added here when it ships.

export const ONBOARDING_STEPS = [
  { key: "profile", label: "Add your business address and phone", href: "/settings" },
  { key: "logo", label: "Upload your logo", href: "/settings" },
  { key: "payment_details", label: "Add bank or wallet details for invoices", href: "/settings/documents" },
  { key: "products", label: "Add or import your products", href: "/inventory" },
  { key: "opening_stock", label: "Enter your opening stock", href: "/inventory" },
  { key: "customer", label: "Add your first customer", href: "/customers" },
  { key: "team", label: "Invite your team", href: "/settings/team" },
  { key: "first_quotation", label: "Send your first quotation", href: "/quotations" },
  { key: "first_invoice", label: "Create your first invoice", href: "/invoices" },
] as const;

export type OnboardingStepKey = (typeof ONBOARDING_STEPS)[number]["key"];

export const ONBOARDING_STEP_KEYS: string[] = ONBOARDING_STEPS.map((s) => s.key);

export const stepInfo = (key: string) => ONBOARDING_STEPS.find((s) => s.key === key);

export type OnboardingProgress = { dismissed: boolean; steps: { step: string; done: boolean }[] };

/** "4 of 9" → 44 (0 when there are no steps). */
export const percentDone = (steps: { done: boolean }[]) =>
  steps.length ? Math.round((steps.filter((s) => s.done).length / steps.length) * 100) : 0;
