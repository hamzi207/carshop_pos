// Optional modules a subscription plan can allow (Phase 17 stores the list; Phase 18 adds the
// switches that read private.tenant_has_module()). null on a plan = every module.

export const MODULES = [{ key: "vehicle_fitment", label: "Vehicle Fitment" }] as const;

export type ModuleKey = (typeof MODULES)[number]["key"];

export const MODULE_KEYS = MODULES.map((m) => m.key) as string[];

export const moduleLabel = (key: string) => MODULES.find((m) => m.key === key)?.label ?? key;

/** "All modules", "None" or the labels. */
export function modulesText(modules: string[] | null) {
  if (modules === null) return "All modules";
  if (modules.length === 0) return "None";
  return modules.map(moduleLabel).join(", ");
}
