// Phase 17: the database refuses a new user or product past the organization's plan limit
// (triggers on profiles / inventory_items raise P0001 with detail "plan_limit:<kind>", a
// readable message and a hint).

type DbError = { code?: string; details?: string | null; message?: string; hint?: string | null } | null | undefined;

/** The refusal's message and hint when `error` is a plan-limit refusal, else null. */
export function planLimitMessage(error: DbError) {
  if (!error || error.code !== "P0001" || !/^plan_limit:/.test(error.details ?? "")) return null;
  return [error.message, error.hint].filter(Boolean).join(" ");
}
