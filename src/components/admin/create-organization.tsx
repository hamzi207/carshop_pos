"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Dialog } from "radix-ui";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Building2, Loader2, Plus, X } from "lucide-react";
import { ModalSheet } from "@/components/shared/modal-sheet";
import { createOrganization } from "@/lib/actions/admin";
import { notify } from "@/lib/notify";
import { createOrganizationSchema, type CreateOrganizationInput } from "@/lib/validations/admin.schema";

/** /admin/tenants → Create Organization: a new shop and its owner, who is emailed a link to choose a password. */
export function CreateOrganizationButton() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className="button button-primary" onClick={() => setOpen(true)}>
        <Plus size={14} /> Create Organization
      </button>
      <Dialog.Root open={open} onOpenChange={setOpen}>
        <ModalSheet className="modal modal-sm">{open && <CreateOrganizationForm onDone={() => setOpen(false)} />}</ModalSheet>
      </Dialog.Root>
    </>
  );
}

function CreateOrganizationForm({ onDone }: { onDone: () => void }) {
  const router = useRouter();
  const [serverError, setServerError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<CreateOrganizationInput>({
    resolver: zodResolver(createOrganizationSchema),
    defaultValues: { shopName: "", fullName: "", email: "", phone: "", status: "active" },
  });

  const onSubmit = handleSubmit(async (values) => {
    setServerError(null);
    const result = await createOrganization(values);
    if (result.status === "error") {
      setServerError(result.message);
      return;
    }
    notify.success("Shop created", result.message);
    onDone();
    if (result.tenantId) router.push(`/admin/tenants/${result.tenantId}`);
  });

  const error = Object.values(errors)[0]?.message ?? serverError;

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
          <label className="span-two">
            <small>The owner is emailed a link to choose a password (it works for 1 hour; Users → Reset password sends a new one).</small>
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
