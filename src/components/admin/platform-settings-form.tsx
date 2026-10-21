"use client";

import { useState, type ReactNode } from "react";
import { Building2, CalendarClock, Loader2, Mail, Plus, Save, Trash2, UserPlus, Wallet, type LucideIcon } from "lucide-react";
import { savePlatformSettings } from "@/lib/actions/platform";
import { notify } from "@/lib/notify";
import type { PlatformSettingsInput } from "@/lib/validations/platform.schema";

type Values = PlatformSettingsInput;
type PlanChoice = { id: string; name: string };

function Card({ icon: Icon, title, text, children }: { icon: LucideIcon; title: string; text: string; children: ReactNode }) {
  return (
    <section className="card settings-card">
      <div className="settings-card-head">
        <span className="header-icon blue"><Icon size={18} /></span>
        <div>
          <h2>{title}</h2>
          <p>{text}</p>
        </div>
      </div>
      {children}
    </section>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="settings-row settings-field">
      <span className="settings-label">
        {label}
        {hint && <small>{hint}</small>}
      </span>
      {children}
    </label>
  );
}

/** /admin/platform: every platform_settings value in one form with one Save. */
export function PlatformSettingsForm({ initial, plans }: { initial: Values; plans: PlanChoice[] }) {
  const [v, setV] = useState<Values>(initial);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dirty = JSON.stringify(v) !== JSON.stringify(initial);

  const set = <K extends keyof Values>(key: K, value: Values[K]) => setV((prev) => ({ ...prev, [key]: value }));
  const text = (key: keyof Values) => ({
    className: "settings-input",
    value: String(v[key] ?? ""),
    onChange: (e: { target: { value: string } }) => set(key, e.target.value as never),
  });
  const wallets = v.wallets ?? [];
  const banks = v.banks ?? [];

  const save = async () => {
    setSaving(true);
    setError(null);
    const result = await savePlatformSettings(v);
    setSaving(false);
    if (result.status === "error") setError(result.message);
    else notify.success("Platform settings saved", result.message);
  };

  return (
    <form
      className="settings-form"
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
      noValidate
    >
      <fieldset className="settings-fields settings-form" disabled={saving}>
        <Card icon={Building2} title="Business" text="Printed on subscription invoices and receipts as the seller.">
          <Field label="Business name"><input {...text("businessName")} maxLength={120} /></Field>
          <Field label="Address"><input {...text("businessAddress")} maxLength={300} /></Field>
          <Field label="Phone"><input {...text("businessPhone")} maxLength={30} inputMode="tel" /></Field>
          <Field label="Email"><input {...text("businessEmail")} maxLength={200} type="email" /></Field>
          <Field label="NTN"><input {...text("businessNtn")} maxLength={30} /></Field>
        </Card>

        <Card icon={Wallet} title="Payment instructions" text="Where organizations pay: shown on their Subscription page, invoices and reminder emails. Mobile wallets and bank transfer only.">
          <div className="pay-edit">
            <h3>Mobile wallets</h3>
            {wallets.map((w, i) => (
              <div key={i} className="pay-edit-row">
                <input className="settings-input" placeholder="JazzCash" aria-label="Wallet" value={w.provider} maxLength={40} onChange={(e) => set("wallets", wallets.map((x, j) => (j === i ? { ...x, provider: e.target.value } : x)))} />
                <input className="settings-input" placeholder="Account title" aria-label="Account title" value={w.title} maxLength={80} onChange={(e) => set("wallets", wallets.map((x, j) => (j === i ? { ...x, title: e.target.value } : x)))} />
                <input className="settings-input mono" placeholder="0300 1234567" aria-label="Wallet number" value={w.number} maxLength={30} inputMode="tel" onChange={(e) => set("wallets", wallets.map((x, j) => (j === i ? { ...x, number: e.target.value } : x)))} />
                <button type="button" className="icon-button" aria-label="Remove wallet" onClick={() => set("wallets", wallets.filter((_, j) => j !== i))}><Trash2 size={14} /></button>
              </div>
            ))}
            {wallets.length < 6 && (
              <button type="button" className="button" onClick={() => set("wallets", [...wallets, { provider: "", title: "", number: "" }])}><Plus size={14} /> Add wallet</button>
            )}
            <h3>Bank accounts</h3>
            {banks.map((b, i) => (
              <div key={i} className="pay-edit-row pay-edit-bank">
                <input className="settings-input" placeholder="Bank" aria-label="Bank" value={b.bank} maxLength={80} onChange={(e) => set("banks", banks.map((x, j) => (j === i ? { ...x, bank: e.target.value } : x)))} />
                <input className="settings-input" placeholder="Account title" aria-label="Account title" value={b.title} maxLength={80} onChange={(e) => set("banks", banks.map((x, j) => (j === i ? { ...x, title: e.target.value } : x)))} />
                <input className="settings-input mono" placeholder="Account number" aria-label="Account number" value={b.number} maxLength={40} onChange={(e) => set("banks", banks.map((x, j) => (j === i ? { ...x, number: e.target.value } : x)))} />
                <input className="settings-input mono" placeholder="IBAN (optional)" aria-label="IBAN" value={b.iban} maxLength={34} onChange={(e) => set("banks", banks.map((x, j) => (j === i ? { ...x, iban: e.target.value } : x)))} />
                <button type="button" className="icon-button" aria-label="Remove bank account" onClick={() => set("banks", banks.filter((_, j) => j !== i))}><Trash2 size={14} /></button>
              </div>
            ))}
            {banks.length < 6 && (
              <button type="button" className="button" onClick={() => set("banks", [...banks, { bank: "", title: "", number: "", iban: "" }])}><Plus size={14} /> Add bank account</button>
            )}
          </div>
          <label className="settings-row settings-field settings-field-wide">
            <span className="settings-label">Note<small>Under the accounts, e.g. &ldquo;Use your invoice number as the reference.&rdquo;</small></span>
            <textarea className="settings-input" rows={2} maxLength={500} value={v.paymentNote ?? ""} onChange={(e) => set("paymentNote", e.target.value)} />
          </label>
        </Card>

        <Card icon={CalendarClock} title="Subscription billing" text="Used by the daily subscription run for every organization (per-organization grace days override the default).">
          <Field label="Invoice lead days" hint="Invoices are issued this many days before the period starts.">
            <input {...text("invoiceLeadDays")} type="number" min={0} max={60} inputMode="numeric" />
          </Field>
          <Field label="Grace days" hint="Days after the due date before an unpaid organization is suspended.">
            <input {...text("defaultGraceDays")} type="number" min={0} max={60} inputMode="numeric" />
          </Field>
          <Field label="Reminders" hint="Days before the due date, e.g. 7, 3, 0 (0 = on the day).">
            <input {...text("reminderDays")} maxLength={40} />
          </Field>
        </Card>

        <Card icon={UserPlus} title="Sign-up & access" text="Self-registration on the sign-up page, and how long Login As lasts.">
          <label className="settings-row">
            <span className="settings-label">Open sign-up<small>Off: only you can create organizations.</small></span>
            <input type="checkbox" className="switch" checked={v.signupOpen} onChange={(e) => set("signupOpen", e.target.checked)} />
          </label>
          <Field label="New sign-ups start as" hint="Trial uses the default plan's trial length.">
            <select className="settings-input" value={v.signupDefaultStatus} onChange={(e) => set("signupDefaultStatus", e.target.value as Values["signupDefaultStatus"])}>
              <option value="trial">Trial</option>
              <option value="active">Active</option>
            </select>
          </Field>
          <Field label="Default plan" hint="The plan new sign-ups get.">
            <select className="settings-input" value={v.defaultPlanId ?? ""} onChange={(e) => set("defaultPlanId", e.target.value)}>
              <option value="">None</option>
              {plans.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </Field>
          <Field label="Login As length" hint="Minutes, 15 to 720.">
            <input {...text("impersonationTtlMinutes")} type="number" min={15} max={720} inputMode="numeric" />
          </Field>
        </Card>

        <Card icon={Mail} title="Email" text="Every email the platform sends. The sending address itself is set on the server.">
          <Field label="Sender name"><input {...text("emailSenderName")} maxLength={80} /></Field>
          <Field label="Reply-to" hint="Where replies go when the email has no shop reply-to."><input {...text("emailReplyTo")} maxLength={200} type="email" /></Field>
          <Field label="Hourly limit per organization" hint="Stops a mistake from using up the email quota.">
            <input {...text("emailHourlyLimit")} type="number" min={1} max={10000} inputMode="numeric" />
          </Field>
        </Card>
      </fieldset>

      <div className="platform-save">
        {error && <div className="form-alert form-alert-error" role="alert">{error}</div>}
        <button type="button" className="button" disabled={!dirty || saving} onClick={() => { setV(initial); setError(null); }}>Discard</button>
        <button type="submit" className="button button-primary" disabled={!dirty || saving}>
          {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} Save Settings
        </button>
      </div>
    </form>
  );
}
