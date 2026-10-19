"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { ImagePlus, Loader2, Store, Trash2 } from "lucide-react";
import { setShopLogo, updateShopProfile } from "@/lib/actions/settings";
import { useUnsavedSettings } from "./unsaved-settings";
import { notify } from "@/lib/notify";
import { formatStrn } from "@/lib/tax-id";
import { shopProfileSchema, type ShopProfileValues } from "@/lib/validations/settings.schema";
import { z } from "zod";

type Props = {
  initial: ShopProfileValues;
  logoUrl: string | null;
  /** Read-only facts shown above the fields. */
  facts: { label: string; value: string; mono?: boolean }[];
  canEdit: boolean;
  /** Superadmin (/admin/tenants/[id]): edit this shop instead of the signed-in user's own. */
  tenantId?: string;
};

/** "Shop details saved" names each changed field ("Address updated."), in form order; untouched ones aren't mentioned. */
const FIELD_NAME: Record<keyof ShopProfileValues, string> = {
  name: "Shop name",
  phone: "Phone",
  email: "Email",
  address: "Address",
  ntn: "NTN",
  strn: "STRN",
  terms: "Terms & notes",
};

// The PDF library draws PNG and JPEG only (checked again on the server by the file's bytes).
const LOGO_TYPES = ["image/png", "image/jpeg"];
const LOGO_MAX_BYTES = 1024 * 1024;

/** Settings → Your shop: the details and logo printed on quotations and invoices. */
export function ShopProfileForm({ initial, logoUrl, facts, canEdit, tenantId }: Props) {
  const router = useRouter();
  const [serverError, setServerError] = useState<string | null>(null);
  const [logo, setLogo] = useState(logoUrl);
  const [uploading, setUploading] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting, isDirty, dirtyFields },
  } = useForm<ShopProfileValues, unknown, z.output<typeof shopProfileSchema>>({
    resolver: zodResolver(shopProfileSchema),
    defaultValues: initial,
  });

  const persist = async (values: z.output<typeof shopProfileSchema>) => {
    setServerError(null);
    const result = await updateShopProfile(values, tenantId);
    if (result.status === "error") {
      setServerError(result.message);
      notify.error("Shop details not saved", result.message);
      return false;
    }
    const changed = (Object.keys(FIELD_NAME) as (keyof ShopProfileValues)[]).filter((k) => dirtyFields[k]).map((k) => FIELD_NAME[k]);
    // Back to how people type them (the saved values are normalised).
    reset({ ...values, strn: formatStrn(values.strn || null) });
    notify.success("Shop details saved", changed.map((f) => `${f} updated.`).join("\n") || "Nothing was changed.");
    return true;
  };
  const onSubmit = handleSubmit(persist);
  // Saved only from the page's save bar (or Enter in a field); see unsaved-settings.tsx.
  useUnsavedSettings(
    "shop-profile",
    "Your shop",
    isDirty,
    () => new Promise<boolean>((resolve) => void handleSubmit(async (v) => resolve(await persist(v)), () => resolve(false))()),
    () => {
      setServerError(null);
      reset();
    },
  );

  const uploadLogo = async (file: File) => {
    if (!LOGO_TYPES.includes(file.type)) return notify.error("Logo not uploaded", "Use a PNG or JPG image.");
    if (file.size > LOGO_MAX_BYTES) return notify.error("Logo not uploaded", "Use an image under 1 MB.");
    setUploading(true);
    const body = new FormData();
    body.append("logo", file);
    if (tenantId) body.append("tenantId", tenantId);
    // Through the app server (checked there, stored in this shop's own folder).
    const res = await fetch("/api/shop/logo", { method: "POST", body }).catch(() => null);
    const result = (await res?.json().catch(() => null)) as { url?: string; error?: string } | null;
    setUploading(false);
    if (!res?.ok || !result?.url) return notify.error("Logo not uploaded", result?.error ?? "The upload failed. Please try again.");
    setLogo(result.url);
    router.refresh();
    notify.success("Logo updated", "It appears at the top of your quotations and invoices.");
  };

  const removeLogo = async () => {
    setUploading(true);
    const result = await setShopLogo(null, tenantId);
    setUploading(false);
    if (result.status === "error") return notify.error("Logo not removed", result.message);
    setLogo(null);
    notify.info("Logo removed", "Quotations and invoices show the shop name instead.");
  };

  const field = (name: keyof ShopProfileValues, label: string, hint: string, opts: { placeholder?: string; type?: string } = {}) => (
    <label className="settings-row settings-field">
      <span className="settings-label">
        {label}
        <small>{hint}</small>
      </span>
      <input
        type={opts.type ?? "text"}
        className="settings-input"
        placeholder={opts.placeholder}
        aria-invalid={errors[name] ? true : undefined}
        {...register(name)}
      />
    </label>
  );

  return (
    <form className="card settings-card" onSubmit={onSubmit} noValidate>
      <div className="settings-card-head">
        <span className="header-icon blue"><Store size={18} /></span>
        <div>
          <h2>{tenantId ? "Company details" : "Your shop"}</h2>
          <p>{tenantId ? "Printed on this shop's quotations and invoices. Changes are audit-logged." : "These details and your logo are printed on quotations and invoices."}</p>
        </div>
      </div>
      {facts.map((f) => (
        <div key={f.label} className="settings-row">
          <span className="settings-label">{f.label}</span>
          <span className={f.mono ? "settings-value mono" : "settings-value"}>{f.value}</span>
        </div>
      ))}

      <div className="settings-row">
        <span className="settings-label">
          Logo
          <small>PNG or JPG, under 1 MB. A wide logo on a white background prints best.</small>
        </span>
        <div className="logo-field">
          {logo ? (
            // eslint-disable-next-line @next/next/no-img-element -- user-uploaded image from Supabase Storage
            <img src={logo} alt="Shop logo" className="logo-preview" />
          ) : (
            <span className="logo-empty">No logo</span>
          )}
          {canEdit && (
            <>
              <input
                ref={fileInput}
                type="file"
                accept="image/png,image/jpeg"
                hidden
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  e.target.value = "";
                  if (file) void uploadLogo(file);
                }}
              />
              <button type="button" className="button" disabled={uploading} onClick={() => fileInput.current?.click()}>
                {uploading ? <Loader2 size={14} className="animate-spin" /> : <ImagePlus size={14} />} {logo ? "Replace" : "Upload"}
              </button>
              {logo && (
                <button type="button" className="icon-button" disabled={uploading} onClick={removeLogo} aria-label="Remove logo">
                  <Trash2 size={15} />
                </button>
              )}
            </>
          )}
        </div>
      </div>

      <fieldset disabled={!canEdit || isSubmitting} className="settings-fields">
        {field("name", "Shop name", "Shown on documents and across the app.")}
        {field("phone", "Phone", "e.g. 0300-1234567 or 042-35123456.", { placeholder: "0300-1234567" })}
        {field("email", "Email", "Optional.", { type: "email", placeholder: "sales@yourshop.pk" })}
        {field("address", "Address", "Printed under your shop name.", { placeholder: "Shop 12, Montgomery Road, Lahore" })}
        {field("ntn", "NTN", "Your shop's FBR National Tax Number (optional).", { placeholder: "1234567-8" })}
        {field("strn", "STRN", "Sales Tax Registration Number, if registered (optional).", { placeholder: "32-77-8761-234-56" })}
        <label className="settings-row settings-field settings-field-wide">
          <span className="settings-label">
            Terms &amp; notes
            <small>Printed at the bottom of quotations and invoices (warranty, returns, bank details…).</small>
          </span>
          <textarea className="settings-input" rows={4} aria-invalid={errors.terms ? true : undefined} {...register("terms")} />
        </label>
      </fieldset>
      {(Object.values(errors)[0] || serverError) && (
        <span className="field-error settings-error">{Object.values(errors)[0]?.message ?? serverError}</span>
      )}
    </form>
  );
}
