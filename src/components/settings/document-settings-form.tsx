"use client";

import { useState } from "react";
import { useFieldArray, useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import type { z } from "zod";
import { Hash, Landmark, Plus, ScrollText, Trash2 } from "lucide-react";
import { updateDocumentSettings } from "@/lib/actions/settings";
import { notify } from "@/lib/notify";
import {
  documentSettingsSchema,
  formatIban,
  formatWalletNumber,
  nextDocumentNumber,
  WALLET_PROVIDERS,
  type DocumentSettingsValues,
} from "@/lib/validations/document-settings.schema";
import { useUnsavedSettings } from "./unsaved-settings";

type Output = z.output<typeof documentSettingsSchema>;

/** Highest number already used in each series (document_number_floors). */
export type NumberFloors = { draft: number; quote: number; invoice: number };

const SERIES = [
  { key: "quote", label: "Quotations", prefix: "quotePrefix", start: "quoteStart", example: "Q" },
  { key: "invoice", label: "Invoices", prefix: "invoicePrefix", start: "invoiceStart", example: "INV" },
  { key: "draft", label: "Drafts (estimates)", prefix: "draftPrefix", start: "draftStart", example: "D" },
] as const;

/** "Document settings saved" lists the parts that changed. */
const GROUPS: { label: string; fields: (keyof DocumentSettingsValues)[] }[] = [
  { label: "Numbering", fields: ["quotePrefix", "quoteStart", "invoicePrefix", "invoiceStart", "draftPrefix", "draftStart"] },
  { label: "Quotation terms", fields: ["quoteTerms"] },
  { label: "Invoice payment terms", fields: ["invoiceTerms"] },
  { label: "Bank details", fields: ["bankName", "bankAccountTitle", "bankAccountNumber", "bankIban", "bankRaastId", "wallets"] },
];

type Props = {
  initial: DocumentSettingsValues;
  floors: NumberFloors;
  canEdit: boolean;
  /** Superadmin console: save to this organization (audited). */
  tenantId?: string;
};

/** Settings → Documents: number prefixes and "start from", terms per document, bank details for invoices. */
export function DocumentSettingsForm({ initial, floors, canEdit, tenantId }: Props) {
  const [serverError, setServerError] = useState<string | null>(null);
  const {
    register,
    control,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting, isDirty, dirtyFields },
  } = useForm<DocumentSettingsValues, unknown, Output>({
    resolver: zodResolver(documentSettingsSchema),
    defaultValues: initial,
  });
  const wallets = useFieldArray({ control, name: "wallets" });
  const watched = useWatch({ control, name: ["quotePrefix", "quoteStart", "invoicePrefix", "invoiceStart", "draftPrefix", "draftStart"] });
  const series = SERIES.map((s, i) => ({ ...s, prefixValue: String(watched[i * 2] ?? "").trim().toUpperCase(), startValue: Number(watched[i * 2 + 1]) }));

  const persist = async (values: Output) => {
    setServerError(null);
    const result = await updateDocumentSettings(values, tenantId);
    if (result.status === "error") {
      setServerError(result.message);
      notify.error("Document settings not saved", result.message);
      return false;
    }
    const changed = GROUPS.filter((g) => g.fields.some((f) => dirtyFields[f])).map((g) => `${g.label} updated.`);
    // Back to how people read them: IBAN in groups of 4, wallets as 0300-1234567.
    reset({
      ...values,
      bankIban: formatIban(values.bankIban || null),
      wallets: values.wallets.map((w) => ({ ...w, number: formatWalletNumber(w.number) })),
    });
    notify.success("Document settings saved", changed.join("\n") || "Nothing was changed.");
    return true;
  };
  const onSubmit = handleSubmit(persist);
  useUnsavedSettings(
    "document-settings",
    "Documents",
    isDirty,
    () => new Promise<boolean>((resolve) => void handleSubmit(async (v) => resolve(await persist(v)), () => resolve(false))()),
    () => {
      setServerError(null);
      reset();
    },
  );

  const error = (name: keyof DocumentSettingsValues) => {
    const e = errors[name];
    return e && "message" in e && e.message ? <span className="field-error settings-error">{e.message}</span> : null;
  };
  const text = (name: keyof DocumentSettingsValues, label: string, hint: string, opts: { placeholder?: string; mono?: boolean; maxLength?: number } = {}) => (
    <>
      <label className="settings-row settings-field">
        <span className="settings-label">
          {label}
          <small>{hint}</small>
        </span>
        <input
          className={`settings-input${opts.mono ? " mono" : ""}`}
          placeholder={opts.placeholder}
          maxLength={opts.maxLength}
          aria-invalid={errors[name] ? true : undefined}
          {...register(name)}
        />
      </label>
      {error(name)}
    </>
  );

  return (
    <form className="settings-form" onSubmit={onSubmit} noValidate>
      {serverError && <div className="form-alert form-alert-error" role="alert">{serverError}</div>}
      <fieldset disabled={!canEdit || isSubmitting}>
        <section className="card settings-card">
          <div className="settings-card-head">
            <span className="header-icon blue"><Hash size={18} /></span>
            <div>
              <h2>Numbering</h2>
              <p>
                Numbers are a prefix and a running number, e.g. INV-1001. &ldquo;Start from&rdquo; only moves numbering forward: numbers
                already used are never reused.
              </p>
            </div>
          </div>
          <div className="numbering-grid" role="table" aria-label="Document numbers">
            <div className="numbering-row numbering-headrow" role="row">
              <span role="columnheader">Document</span>
              <span role="columnheader">Prefix</span>
              <span role="columnheader">Start from</span>
              <span role="columnheader">Next number</span>
            </div>
            {series.map((s) => {
              const used = floors[s.key];
              const next = nextDocumentNumber(s.prefixValue, s.startValue, used);
              const behind = used > 0 && Number.isFinite(s.startValue) && s.startValue <= used;
              return (
                <div key={s.key} className="numbering-row" role="row">
                  <span role="cell" className="numbering-name">{s.label}</span>
                  <span role="cell" data-label="Prefix">
                    <input
                      className="settings-input mono numbering-prefix"
                      aria-label={`${s.label} prefix`}
                      placeholder={s.example}
                      maxLength={10}
                      autoCapitalize="characters"
                      aria-invalid={errors[s.prefix] ? true : undefined}
                      {...register(s.prefix)}
                    />
                  </span>
                  <span role="cell" data-label="Start from">
                    <input
                      type="number"
                      inputMode="numeric"
                      min={1}
                      max={99999999}
                      className="settings-input mono"
                      aria-label={`${s.label} start from`}
                      aria-invalid={errors[s.start] ? true : undefined}
                      {...register(s.start, { valueAsNumber: true })}
                    />
                  </span>
                  <span role="cell" className="numbering-next" data-label="Next">
                    <strong className="mono">{next}</strong>
                    {behind && <small>Already at {used}</small>}
                  </span>
                </div>
              );
            })}
          </div>
          {SERIES.map((s) => (
            <span key={s.key}>{error(s.prefix)}{error(s.start)}</span>
          ))}
        </section>

        <section className="card settings-card">
          <div className="settings-card-head">
            <span className="header-icon blue"><ScrollText size={18} /></span>
            <div>
              <h2>Terms</h2>
              <p>Printed at the bottom of the matching documents and shown on the customer link.</p>
            </div>
          </div>
          <label className="settings-row settings-field settings-field-wide">
            <span className="settings-label">
              Quotation terms
              <small>On quotations and estimates: validity, warranty, fitting, returns…</small>
            </span>
            <textarea className="settings-input" rows={4} maxLength={2000} aria-invalid={errors.quoteTerms ? true : undefined} {...register("quoteTerms")} />
          </label>
          {error("quoteTerms")}
          <label className="settings-row settings-field settings-field-wide">
            <span className="settings-label">
              Invoice payment terms
              <small>On invoices: when payment is due, late payment, cheques payable to…</small>
            </span>
            <textarea className="settings-input" rows={4} maxLength={2000} aria-invalid={errors.invoiceTerms ? true : undefined} {...register("invoiceTerms")} />
          </label>
          {error("invoiceTerms")}
        </section>

        <section className="card settings-card">
          <div className="settings-card-head">
            <span className="header-icon blue"><Landmark size={18} /></span>
            <div>
              <h2>Bank details</h2>
              <p>
                A &ldquo;Bank Remittance&rdquo; box on invoices that still have a balance (PDF and customer link, with Copy IBAN). Leave
                empty to leave it off.
              </p>
            </div>
          </div>
          <div className="settings-fields">
            {text("bankName", "Bank name", "e.g. Meezan Bank, HBL, UBL.", { maxLength: 120 })}
            {text("bankAccountTitle", "Account title", "The name on the account.", { maxLength: 120 })}
            {text("bankAccountNumber", "Account number", "As printed on your cheque book.", { mono: true, maxLength: 40 })}
            {text("bankIban", "IBAN", "24 characters, starting with PK.", { placeholder: "PK36 SCBL 0000 0011 2345 6702", mono: true, maxLength: 34 })}
            {text("bankRaastId", "Raast ID", "Usually your mobile number registered for Raast.", { placeholder: "0300-1234567", mono: true, maxLength: 40 })}
          </div>

          <div className="settings-row wallets-head">
            <span className="settings-label">
              Mobile wallets
              <small>JazzCash, EasyPaisa and others: up to 5.</small>
            </span>
            {canEdit && wallets.fields.length < 5 && (
              <button type="button" className="button" onClick={() => wallets.append({ provider: "JazzCash", number: "", title: "" })}>
                <Plus size={14} /> Add wallet
              </button>
            )}
          </div>
          {wallets.fields.length > 0 && (
            <ul className="wallet-list">
              {wallets.fields.map((w, i) => {
                const e = errors.wallets?.[i];
                return (
                  <li key={w.id}>
                    <select className="settings-input" aria-label="Wallet" {...register(`wallets.${i}.provider`)}>
                      {WALLET_PROVIDERS.map((p) => <option key={p} value={p}>{p}</option>)}
                    </select>
                    <input
                      className="settings-input mono"
                      inputMode="tel"
                      placeholder="0300-1234567"
                      aria-label="Wallet mobile number"
                      maxLength={14}
                      aria-invalid={e?.number ? true : undefined}
                      {...register(`wallets.${i}.number`)}
                    />
                    <input
                      className="settings-input"
                      placeholder="Account name (optional)"
                      aria-label="Wallet account name"
                      maxLength={120}
                      {...register(`wallets.${i}.title`)}
                    />
                    {canEdit && (
                      <button type="button" className="icon-button" aria-label="Remove wallet" onClick={() => wallets.remove(i)}>
                        <Trash2 size={15} />
                      </button>
                    )}
                    {e?.number?.message && <span className="field-error">{e.number.message}</span>}
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </fieldset>
    </form>
  );
}
