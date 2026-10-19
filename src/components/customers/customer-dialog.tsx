"use client";

import { useEffect, useState } from "react";
import { Dialog } from "radix-ui";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2, Plus, Save, UserPlus, X } from "lucide-react";
import { createCustomer, updateCustomer } from "@/lib/actions/customers";
import { formatPhone, PHONE_EXAMPLE } from "@/lib/phone";
import { notify } from "@/lib/notify";
import { useDiscardGuard } from "@/components/shared/discard-changes";
import { ModalSheet } from "@/components/shared/modal-sheet";
import { formatStrn } from "@/lib/tax-id";
import type { Tables } from "@/lib/types/database.types";
import {
  CUSTOMER_TYPES,
  customerSchema,
  type CustomerFormValues,
  type CustomerInput,
  type CustomerType,
  type TaxRegistrationStatus,
} from "@/lib/validations/customer.schema";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  allowInternationalPhones: boolean;
  /** Edit this customer; omit to register a new one. */
  customer?: Tables<"customers">;
  /** Called with the saved customer's id. */
  onSaved?: (id: string) => void;
  /** Starting values for a new customer (e.g. a walk-in's name and phone). */
  prefill?: { name?: string; whatsappNumber?: string };
};

export function CustomerDialog({ open, onOpenChange, allowInternationalPhones, customer, onSaved, prefill }: Props) {
  // Closing with unsaved edits asks first (Cancel, X, Escape, clicking outside).
  const guard = useDiscardGuard({
    onOpenChange,
    discardedNote: customer ? `${customer.name} was left as it was saved.` : "The new customer was not registered.",
  });
  return (
    <>
      <Dialog.Root open={open} onOpenChange={guard.requestOpenChange}>
        <ModalSheet>
          <CustomerForm
            key={customer?.id ?? "new"}
            customer={customer}
            prefill={prefill}
            allowInternationalPhones={allowInternationalPhones}
            onDirtyChange={guard.setDirty}
            onDone={(id) => {
              guard.close();
              onSaved?.(id);
            }}
          />
        </ModalSheet>
      </Dialog.Root>
      {guard.prompt}
    </>
  );
}

function CustomerForm({
  customer,
  prefill,
  allowInternationalPhones,
  onDirtyChange,
  onDone,
}: {
  customer?: Tables<"customers">;
  prefill?: Props["prefill"];
  allowInternationalPhones: boolean;
  onDirtyChange: (dirty: boolean) => void;
  onDone: (id: string) => void;
}) {
  const isEdit = Boolean(customer);
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    register,
    control,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting, isDirty },
  } = useForm<CustomerFormValues, unknown, CustomerInput>({
    resolver: zodResolver(customerSchema(allowInternationalPhones)),
    defaultValues: {
      name: customer?.name ?? prefill?.name ?? "",
      customerType: (customer?.customer_type as CustomerType) ?? "Retail Customer",
      contactPerson: customer?.contact_person ?? "",
      // Shown the way people type them (0300-1234567), stored as E.164.
      whatsappNumber: customer ? formatPhone(customer.whatsapp_number) : (prefill?.whatsappNumber ?? ""),
      phone: formatPhone(customer?.phone),
      email: customer?.email ?? "",
      billingAddress: customer?.billing_address ?? "",
      cnicOrNtn: customer?.cnic_or_ntn ?? "",
      taxRegistrationStatus: (customer?.tax_registration_status as TaxRegistrationStatus) ?? "unregistered",
      strn: formatStrn(customer?.strn ?? null),
      defaultDiscountPercentage: customer ? Number(customer.default_discount_percentage) : 0,
      creditDays: customer?.credit_days ?? 0,
      notes: customer?.notes ?? "",
    },
  });

  useEffect(() => onDirtyChange(isDirty), [isDirty, onDirtyChange]);

  const [customerType, registration] = useWatch({ control, name: ["customerType", "taxRegistrationStatus"] });
  const needsTaxId = customerType !== "Retail Customer" || registration === "registered";

  const onSubmit = handleSubmit(async (values) => {
    setServerError(null);
    const result = customer ? await updateCustomer(customer.id, values) : await createCustomer(values);
    if (result.status === "error") {
      if (result.field) setError(result.field, { message: result.message });
      else setServerError(result.message);
      notify.error(isEdit ? "Customer not saved" : "Customer not registered", result.message);
      return;
    }
    const terms = [
      values.creditDays > 0 ? `${values.creditDays}-day credit period` : "due on the invoice date",
      values.defaultDiscountPercentage > 0 ? `${values.defaultDiscountPercentage}% default discount` : null,
    ].filter(Boolean).join(" · ");
    notify.success(
      isEdit ? `${values.name} updated` : `${values.name} registered`,
      isEdit ? `Customer details saved (${terms}).` : `Added to your customer directory (${terms}).`,
    );
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
            <span>SALES TAX REGISTRATION</span>
            <select {...invalid("taxRegistrationStatus")} {...register("taxRegistrationStatus")}>
              <option value="unregistered">Not registered</option>
              <option value="registered">Registered (has STRN)</option>
            </select>
            {fieldError("taxRegistrationStatus")}
          </label>
          <label>
            <span>CNIC / NTN{needsTaxId ? "" : " (OPTIONAL)"}</span>
            <input placeholder="12345-1234567-1 or 1234567-8" {...invalid("cnicOrNtn")} {...register("cnicOrNtn")} />
            {fieldError("cnicOrNtn")}
          </label>
          {registration === "registered" && (
            <label>
              <span>STRN (SALES TAX REG. NO.)</span>
              <input placeholder="e.g. 32-77-8761-234-56" {...invalid("strn")} {...register("strn")} />
              {fieldError("strn")}
            </label>
          )}
          <label>
            <span>CREDIT PERIOD (DAYS)</span>
            <input
              type="number"
              inputMode="numeric"
              min="0"
              max="365"
              step="1"
              {...invalid("creditDays")}
              {...register("creditDays", { valueAsNumber: true })}
            />
            {errors.creditDays?.message ? fieldError("creditDays") : (
              <span className="field-note">Their invoices fall due this many days after the invoice date (0 = same day).</span>
            )}
          </label>
          <label>
            <span>DEFAULT DISCOUNT %</span>
            <input
              type="number"
              inputMode="decimal"
              min="0"
              max="100"
              step="0.01"
              {...invalid("defaultDiscountPercentage")}
              {...register("defaultDiscountPercentage", { valueAsNumber: true })}
            />
            {errors.defaultDiscountPercentage?.message ? fieldError("defaultDiscountPercentage") : (
              <span className="field-note">Applied automatically to their quotes and invoices.</span>
            )}
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
