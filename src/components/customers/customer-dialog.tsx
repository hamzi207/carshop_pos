"use client";

import { useState } from "react";
import { Dialog } from "radix-ui";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { Loader2, Plus, Save, UserPlus, X } from "lucide-react";
import { createCustomer, updateCustomer } from "@/lib/actions/customers";
import { formatPhone, PHONE_EXAMPLE } from "@/lib/phone";
import type { Tables } from "@/lib/types/database.types";
import {
  CUSTOMER_TYPES,
  customerSchema,
  type CustomerFormValues,
  type CustomerInput,
  type CustomerType,
} from "@/lib/validations/customer.schema";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  allowInternationalPhones: boolean;
  /** Edit this customer; omit to register a new one. */
  customer?: Tables<"customers">;
  /** Called with the saved customer's id. */
  onSaved?: (id: string) => void;
};

export function CustomerDialog({ open, onOpenChange, allowInternationalPhones, customer, onSaved }: Props) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="modal-backdrop">
          <Dialog.Content className="modal">
            <CustomerForm
              key={customer?.id ?? "new"}
              customer={customer}
              allowInternationalPhones={allowInternationalPhones}
              onDone={(id) => {
                onOpenChange(false);
                onSaved?.(id);
              }}
            />
          </Dialog.Content>
        </Dialog.Overlay>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function CustomerForm({
  customer,
  allowInternationalPhones,
  onDone,
}: {
  customer?: Tables<"customers">;
  allowInternationalPhones: boolean;
  onDone: (id: string) => void;
}) {
  const isEdit = Boolean(customer);
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<CustomerFormValues, unknown, CustomerInput>({
    resolver: zodResolver(customerSchema(allowInternationalPhones)),
    defaultValues: {
      name: customer?.name ?? "",
      customerType: (customer?.customer_type as CustomerType) ?? "Retail Customer",
      contactPerson: customer?.contact_person ?? "",
      // Shown the way people type them (0300-1234567), stored as E.164.
      whatsappNumber: formatPhone(customer?.whatsapp_number),
      phone: formatPhone(customer?.phone),
      email: customer?.email ?? "",
      billingAddress: customer?.billing_address ?? "",
      taxId: customer?.tax_id ?? "",
      notes: customer?.notes ?? "",
    },
  });

  const onSubmit = handleSubmit(async (values) => {
    setServerError(null);
    const result = customer ? await updateCustomer(customer.id, values) : await createCustomer(values);
    if (result.status === "error") {
      if (result.field) setError(result.field, { message: result.message });
      else setServerError(result.message);
      return;
    }
    toast.success(isEdit ? `${values.name} updated` : `${values.name} registered`);
    onDone(result.id);
  });

  const fieldError = (name: keyof CustomerFormValues) =>
    errors[name]?.message ? (
      <span className="field-error" id={`c-${name}-error`}>{errors[name]?.message}</span>
    ) : null;

  const invalid = (name: keyof CustomerFormValues) => ({
    "aria-invalid": errors[name] ? true : undefined,
    "aria-describedby": errors[name] ? `c-${name}-error` : undefined,
  });

  const phonePlaceholder = allowInternationalPhones ? `${PHONE_EXAMPLE} or +971…` : PHONE_EXAMPLE;

  return (
    <form onSubmit={onSubmit} noValidate>
      <div className="modal-header">
        <div>
          <span className="header-icon blue"><UserPlus size={18} /></span>
          <div>
            <Dialog.Title asChild>
              <h2>{isEdit ? "Edit customer" : "Register customer"}</h2>
            </Dialog.Title>
            <Dialog.Description asChild>
              <p>{isEdit ? "Update contact and billing details." : "Add a dealership, fleet account or retail client."}</p>
            </Dialog.Description>
          </div>
        </div>
        <Dialog.Close asChild>
          <button type="button" className="icon-button" aria-label="Close"><X size={16} /></button>
        </Dialog.Close>
      </div>

      <div className="modal-body">
        {serverError && <div className="form-alert form-alert-error modal-alert" role="alert">{serverError}</div>}
        <div className="form-grid">
          <label className="span-two">
            <span>CUSTOMER / COMPANY NAME</span>
            <input placeholder="e.g. Precision Auto Dealership" autoComplete="organization" {...invalid("name")} {...register("name")} />
            {fieldError("name")}
          </label>
          <label>
            <span>CUSTOMER TYPE</span>
            <select {...invalid("customerType")} {...register("customerType")}>
              {CUSTOMER_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
            {fieldError("customerType")}
          </label>
          <label>
            <span>CONTACT PERSON</span>
            <input placeholder="e.g. Ahmed Khan" autoComplete="name" {...invalid("contactPerson")} {...register("contactPerson")} />
            {fieldError("contactPerson")}
          </label>
          <label>
            <span>WHATSAPP NUMBER</span>
            <input type="tel" inputMode="tel" placeholder={phonePlaceholder} autoComplete="tel" {...invalid("whatsappNumber")} {...register("whatsappNumber")} />
            {fieldError("whatsappNumber")}
          </label>
          <label>
            <span>OTHER PHONE (OPTIONAL)</span>
            <input type="tel" inputMode="tel" placeholder={`e.g. 051-1234567`} {...invalid("phone")} {...register("phone")} />
            {fieldError("phone")}
          </label>
          <label>
            <span>EMAIL (OPTIONAL)</span>
            <input type="email" placeholder="accounts@company.pk" autoComplete="email" {...invalid("email")} {...register("email")} />
            {fieldError("email")}
          </label>
          <label>
            <span>NTN / TAX ID (OPTIONAL)</span>
            <input placeholder="e.g. 1234567-8" {...invalid("taxId")} {...register("taxId")} />
            {fieldError("taxId")}
          </label>
          <label className="span-two">
            <span>BILLING ADDRESS (OPTIONAL)</span>
            <textarea rows={2} placeholder="Street, area, city" {...invalid("billingAddress")} {...register("billingAddress")} />
            {fieldError("billingAddress")}
          </label>
          <label className="span-two">
            <span>NOTES (OPTIONAL)</span>
            <textarea rows={2} placeholder="Payment terms, preferred contact time, vehicles they usually bring…" {...invalid("notes")} {...register("notes")} />
            {fieldError("notes")}
          </label>
        </div>
      </div>

      <div className="modal-footer">
        <Dialog.Close asChild>
          <button type="button" className="button">Cancel</button>
        </Dialog.Close>
        <button type="submit" className="button button-primary" disabled={isSubmitting}>
          {isSubmitting ? <Loader2 size={14} className="animate-spin" /> : isEdit ? <Save size={14} /> : <Plus size={14} />}
          {isSubmitting ? "Saving…" : isEdit ? "Save Changes" : "Register Customer"}
        </button>
      </div>
    </form>
  );
}
