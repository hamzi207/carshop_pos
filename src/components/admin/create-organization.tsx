"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Dialog } from "radix-ui";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Building2, Copy, KeyRound, Loader2, Plus, X } from "lucide-react";
import { ModalSheet } from "@/components/shared/modal-sheet";
import { createOrganization } from "@/lib/actions/admin";
import { notify } from "@/lib/notify";
import { createOrganizationSchema, type CreateOrganizationInput } from "@/lib/validations/admin.schema";

export type PlanChoice = { id: string; name: string; monthly: boolean; yearly: boolean; isDefault: boolean };

/**
 * /admin/tenants → Create Organization: a new shop on a plan, and its owner, who is emailed a link to
 * choose a password or given a temporary one (Phase 17).
 */
export function CreateOrganizationButton({ plans }: { plans: PlanChoice[] }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className="button button-primary" onClick={() => setOpen(true)}>
        <Plus size={14} /> Create Organization
      </button>
      <Dialog.Root open={open} onOpenChange={setOpen}>
        <ModalSheet className="modal modal-sm">{open && <CreateOrganizationForm plans={plans} onDone={() => setOpen(false)} />}</ModalSheet>
      </Dialog.Root>
    </>
  );
}

function CreateOrganizationForm({ plans, onDone }: { plans: PlanChoice[]; onDone: () => void }) {
  const router = useRouter();
  const [serverError, setServerError] = useState<string | null>(null);
  const [created, setCreated] = useState<{ tenantId: string; password: string; name: string; email: string } | null>(null);
  const defaultPlan = plans.find((p) => p.isDefault) ?? plans[0];
  const {
    register,
    control,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<CreateOrganizationInput>({
    resolver: zodResolver(createOrganizationSchema),
    defaultValues: {
      shopName: "",
      fullName: "",
      email: "",
      phone: "",
      status: "active",
      planId: defaultPlan?.id ?? "",
      cycle: defaultPlan && !defaultPlan.monthly ? "yearly" : "monthly",
      access: "email",
    },
  });

  const onSubmit = handleSubmit(async (values) => {
    setServerError(null);
    const result = await createOrganization(values);
    if (result.status === "error") {
      setServerError(result.message);
      return;
    }
    notify.success("Shop created", result.message);
    if (result.password && result.tenantId) {
      setCreated({ tenantId: result.tenantId, password: result.password, name: values.fullName, email: values.email });
      return;
    }
    onDone();
    if (result.tenantId) router.push(`/admin/tenants/${result.tenantId}`);
  });

  const error = Object.values(errors)[0]?.message ?? serverError;
  const planId = useWatch({ control, name: "planId" });
  const access = useWatch({ control, name: "access" });
  const plan = plans.find((p) => p.id === planId);

  if (created) {
    const open = () => {
      onDone();
      router.push(`/admin/tenants/${created.tenantId}`);
    };
    return <PasswordStep {...created} onDone={open} />;
  }

  return (
    <form onSubmit={onSubmit} noValidate>
      <div className="modal-header">
        <div>
          <span className="header-icon blue"><Building2 size={18} /></span>
          <div>
            <Dialog.Title asChild><h2>Create organization</h2></Dialog.Title>
            <Dialog.Description asChild>
              <p>Sets up the shop like a normal sign-up: default categories and a walk-in customer.</p>
            </Dialog.Description>
          </div>
        </div>
        <Dialog.Close asChild>
          <button type="button" className="icon-button" aria-label="Close"><X size={16} /></button>
        </Dialog.Close>
      </div>
      <div className="modal-body">
        {error && <div className="form-alert form-alert-error modal-alert" role="alert">{error}</div>}
        <fieldset className="form-grid" disabled={isSubmitting}>
          <label className="span-two">
            <span>SHOP NAME</span>
            <input {...register("shopName")} placeholder="e.g. Lahore Auto Styling" maxLength={80} autoFocus aria-invalid={errors.shopName ? true : undefined} />
          </label>
          <label>
            <span>OWNER&apos;S FULL NAME</span>
            <input {...register("fullName")} maxLength={80} aria-invalid={errors.fullName ? true : undefined} />
          </label>
          <label>
            <span>OWNER&apos;S EMAIL</span>
            <input type="email" inputMode="email" {...register("email")} maxLength={200} aria-invalid={errors.email ? true : undefined} />
          </label>
          <label>
            <span>SHOP PHONE (OPTIONAL)</span>
            <input type="tel" inputMode="tel" {...register("phone")} placeholder="0300-1234567" maxLength={30} />
          </label>
          <label>
            <span>STATUS</span>
            <select {...register("status")}>
              <option value="active">Active</option>
              <option value="trial">Trial</option>
            </select>
          </label>
          <label>
            <span>PLAN</span>
            <select {...register("planId")}>
              {plans.map((p) => <option key={p.id} value={p.id}>{p.name}{p.isDefault ? " (default)" : ""}</option>)}
            </select>
          </label>
          <label>
            <span>BILLING</span>
            <select {...register("cycle")}>
              <option value="monthly" disabled={plan ? !plan.monthly : false}>Monthly</option>
              <option value="yearly" disabled={plan ? !plan.yearly : false}>Yearly</option>
            </select>
          </label>
          <label className="span-two">
            <span>OWNER&apos;S FIRST SIGN-IN</span>
            <select {...register("access")}>
              <option value="email">Email them a link to choose a password</option>
              <option value="password">Set a temporary password (shown once)</option>
            </select>
            <small>
              {access === "password"
                ? "You give them the password yourself; no email is sent."
                : "The link works for 1 hour; Users → Reset password sends a new one."}{" "}
              Trial status starts the plan&apos;s free trial.
            </small>
          </label>
        </fieldset>
      </div>
      <div className="modal-footer">
        <Dialog.Close asChild>
          <button type="button" className="button" disabled={isSubmitting}>Cancel</button>
        </Dialog.Close>
        <button type="submit" className="button button-primary" disabled={isSubmitting}>
          {isSubmitting ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />} Create Shop
        </button>
      </div>
    </form>
  );
}

function PasswordStep({ name, email, password, onDone }: { name: string; email: string; password: string; onDone: () => void }) {
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(password);
      notify.success("Password copied", `Give it to ${name} privately.`);
    } catch {
      notify.error("Couldn't copy", "Select the password and copy it by hand.");
    }
  };
  return (
    <>
      <div className="modal-header">
        <div>
          <span className="header-icon blue"><KeyRound size={18} /></span>
          <div>
            <Dialog.Title asChild><h2>Temporary password</h2></Dialog.Title>
            <Dialog.Description asChild><p>{name} · {email}</p></Dialog.Description>
          </div>
        </div>
      </div>
      <div className="modal-body">
        <div className="temp-password mono">{password}</div>
        <p className="confirm-text">Shown only now and not saved anywhere. Give it to {name} privately; they sign in with it at /login.</p>
      </div>
      <div className="modal-footer">
        <button type="button" className="button" onClick={() => void copy()}><Copy size={14} /> Copy</button>
        <button type="button" className="button button-primary" onClick={onDone}>Open the Organization</button>
      </div>
    </>
  );
}
