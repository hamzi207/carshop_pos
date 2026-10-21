import { Suspense } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { DocumentSettingsForm, type NumberFloors } from "@/components/settings/document-settings-form";
import { ShopSettingsForm } from "@/components/settings/shop-settings-form";
import { SettingsLoading, shopSettingsValues } from "@/components/settings/shop-settings-section";
import { UnsavedSettings } from "@/components/settings/unsaved-settings";
import { tenantParam } from "@/lib/admin-params";
import { getTenantDocumentSettings, getTenantSettings } from "@/lib/tenant-settings-data";
import { timeZoneGroups } from "@/lib/timezones";
import { formatIban, formatWalletNumber, parseWallets } from "@/lib/validations/document-settings.schema";

export const metadata: Metadata = { title: "Shop · Documents" };

type Params = Promise<{ id: string }>;

const floor = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : 0);

async function Documents({ params }: { params: Params }) {
  const id = await tenantParam(params);
  const [tenant, docs] = await Promise.all([getTenantSettings(id), getTenantDocumentSettings(id)]);
  if (!tenant || !docs) notFound();
  const t = docs.row;
  const used: NumberFloors = { quote: floor(docs.floors.quote), invoice: floor(docs.floors.invoice), draft: floor(docs.floors.draft) };
  return (
    <UnsavedSettings>
      <DocumentSettingsForm
        tenantId={id}
        canEdit
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
      <ShopSettingsForm
        tenantId={id}
        sections={["validity"]}
        label="Quotations"
        canEdit
        readOnlyNote={false}
        timeZoneGroups={timeZoneGroups()}
        initial={shopSettingsValues(tenant)}
      />
    </UnsavedSettings>
  );
}

/** Documents tab: numbering, terms and bank details, the organization's own form. */
export default function TenantDocumentsPage({ params }: { params: Params }) {
  return (
    <div className="settings-form">
      <Suspense fallback={<SettingsLoading />}>
        <Documents params={params} />
      </Suspense>
    </div>
  );
}
