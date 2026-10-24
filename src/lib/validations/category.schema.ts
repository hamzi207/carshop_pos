import { z } from "zod";
import { COLOR_KEYS } from "@/lib/category-colors";
import { ICON_NAMES } from "@/lib/category-icons";
import { MODULE_KEYS } from "@/lib/modules";
import { ONBOARDING_STEP_KEYS } from "@/lib/onboarding";

// Phase 18: categories, attributes and industries are platform data the superadmin edits in /admin.

export const categoryNameSchema = z
  .string()
  .trim()
  .min(1, "Enter a category name.")
  .max(60, "Category names must be 60 characters or fewer.");

const uuid = z.uuid("Invalid id.");

/** Settings → Categories → Request a category. */
export const categoryRequestSchema = z.object({
  name: categoryNameSchema,
  parentId: uuid.nullable(),
  note: z.string().trim().max(500, "Notes must be 500 characters or fewer."),
});
export type CategoryRequestInput = z.input<typeof categoryRequestSchema>;

/** The catalog editor's details form (name, SKU prefix, icon, colour). Empty strings clear a field. */
export const categoryDetailsSchema = z.object({
  name: categoryNameSchema,
  skuPrefix: z
    .string()
    .trim()
    .toUpperCase()
    .refine((v) => v === "" || /^[A-Z0-9]{2,6}$/.test(v), "SKU prefixes are 2–6 capital letters or digits, e.g. BEV."),
  icon: z.string().refine((v) => v === "" || ICON_NAMES.includes(v), "Pick an icon from the list."),
  color: z.string().refine((v) => v === "" || (COLOR_KEYS as string[]).includes(v), "Pick a colour from the list."),
});
export type CategoryDetailsInput = z.input<typeof categoryDetailsSchema>;

export const ATTRIBUTE_TYPES = [
  { value: "text", label: "Text" },
  { value: "number", label: "Number" },
  { value: "date", label: "Date" },
  { value: "boolean", label: "Yes / No" },
  { value: "select", label: "List of options" },
] as const;
export type AttributeType = (typeof ATTRIBUTE_TYPES)[number]["value"];

/** RF-18.1: a custom product attribute (industry-wide or one organization's, optionally per category). */
export const attributeSchema = z
  .object({
    label: z.string().trim().min(1, "Enter a label.").max(60, "Labels must be 60 characters or fewer."),
    key: z
      .string()
      .trim()
      .toLowerCase()
      .regex(/^[a-z][a-z0-9_]{0,39}$/, "Keys start with a letter and use lowercase letters, digits and _, e.g. warranty_months."),
    type: z.enum(["text", "number", "date", "boolean", "select"]),
    options: z.array(z.string().trim().min(1).max(60, "Options must be 60 characters or fewer.")).max(50, "At most 50 options."),
    categoryId: uuid.nullable(),
    isRequired: z.boolean(),
    showOnDocuments: z.boolean(),
    sortOrder: z.number().int().min(-1000).max(1000),
  })
  .refine((a) => (a.type === "select") === a.options.length > 0, {
    message: "List attributes need at least one option; other types have none.",
    path: ["options"],
  })
  .refine((a) => new Set(a.options.map((o) => o.toLowerCase())).size === a.options.length, {
    message: "Options must be different from each other.",
    path: ["options"],
  });
export type AttributeInput = z.input<typeof attributeSchema>;

/** /admin/industries. */
export const industrySchema = z.object({
  name: z.string().trim().min(2, "Enter an industry name.").max(80, "Names must be 80 characters or fewer."),
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .max(60, "Slugs must be 60 characters or fewer.")
    .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, "Slugs use lowercase letters, numbers and single dashes, e.g. furniture."),
  description: z.string().trim().max(300, "Descriptions must be 300 characters or fewer."),
  icon: z.string().refine((v) => ICON_NAMES.includes(v), "Pick an icon from the list."),
  sortOrder: z.number().int().min(-1000).max(10000),
  isActive: z.boolean(),
  defaultModules: z.array(z.string().refine((m) => MODULE_KEYS.includes(m), "Unknown module.")),
  defaultUoms: z
    .array(z.string().trim().toLowerCase().regex(/^[a-z][a-z0-9]{0,9}$/, "Units are short codes like pcs, kg or m."))
    .min(1, "Add at least one unit.")
    .max(30, "At most 30 units."),
  pricesIncludeTax: z.boolean(),
  onboardingSteps: z.array(z.string().refine((s) => ONBOARDING_STEP_KEYS.includes(s), "Unknown step.")).max(20),
});
export type IndustryInput = z.input<typeof industrySchema>;
