import { Suspense } from "react";
import type { Metadata } from "next";
import { getShopSession } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { DocumentSettingsForm, type NumberFloors } from "@/components/settings/document-settings-form";
import { ShopSettingsForm } from "@/components/settings/shop-settings-form";
import { SettingsLoading, shopSettingsValues } from "@/components/settings/shop-settings-section";
import { UnsavedSettings } from "@/components/settings/unsaved-settings";
import { timeZoneGroups } from "@/lib/timezones";
import { formatIban, formatWalletNumber, parseWallets } from "@/lib/validations/document-settings.schema";

export const metadata: Metadata = { title: "Settings · Documents" };

const floor = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : 0);

async function DocumentsContent() {
  const { tenant, role } = await getShopSession();
  const supabase = await createClient();
  const [{ data: t, error }, { data: floors }] = await Promise.all([
    supabase
      .from("tenants")
      .select(
        "quote_prefix, quote_start_number, invoice_prefix, invoice_start_number, draft_prefix, draft_start_number, quote_footer_notes, invoice_terms, bank_name, bank_account_title, bank_account_number, bank_iban, bank_raast_id, bank_wallets",
      )
      .eq("id", tenant.id)
      .single(),
    supabase.rpc("document_number_floors"),
  ]);
  if (error || !t) throw new Error("Could not load the document settings.");
  const f = (floors ?? {}) as Record<string, unknown>;
  const used: NumberFloors = { quote: floor(f.quote), invoice: floor(f.invoice), draft: floor(f.draft) };
  const canEdit = role === "admin";

  return (
    <UnsavedSettings>
      {!canEdit && (
        <div className="form-alert form-alert-info" role="status">
          Only shop admins can change these settings.
        </div>
      )}
      <DocumentSettingsForm
        canEdit={canEdit}
        floors={used}
        initial={{
          quotePrefix: t.quote_prefix,
          quoteStart: t.quote_start_number,
          invoicePrefix: t.invoice_prefix,
          invoiceStart: t.invoice_start_number,
          draftPrefix: t.draft_prefix,
          draftStart: t.draft_start_number,
          quoteTerms: t.quote_footer_notes ?? "",
          invoiceTerms: t.invoice_terms ?? "",
          bankName: t.bank_name ?? "",
          bankAccountTitle: t.bank_account_title ?? "",
          bankAccountNumber: t.bank_account_number ?? "",
          bankIban: formatIban(t.bank_iban),
          bankRaastId: t.bank_raast_id ?? "",
          wallets: parseWallets(t.bank_wallets).map((w) => ({ ...w, number: formatWalletNumber(w.number) })),
        }}
      />
      {/* How long a quotation is valid: one of the shop settings, saved with the same bar. */}
      <ShopSettingsForm
        sections={["validity"]}
        label="Quotations"
        canEdit={canEdit}
        readOnlyNote={false}
        timeZoneGroups={timeZoneGroups()}
        initial={shopSettingsValues(tenant)}
      />
    </UnsavedSettings>
  );
}

export default function SettingsDocumentsPage() {
  return (
    <div className="settings-form">
      <Suspense fallback={<SettingsLoading />}>
        <DocumentsContent />
      </Suspense>
    </div>
  );
}
