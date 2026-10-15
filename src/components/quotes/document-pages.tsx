import { Suspense } from "react";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ChevronRight, FilePen, FileText, Plus, ReceiptText } from "lucide-react";
import { getDocuments, getQuote } from "@/lib/actions/quotes";
import { getShopSession } from "@/lib/auth";
import {
  documentHref,
  earlierNumbers,
  SECTION,
  sectionForStatus,
  STATUS_LABEL,
  STATUS_TONE,
  type DocumentSection,
} from "@/lib/documents";
import { formatDate, formatMoney, formatVehicle } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import type { CustomerOption, DocumentListItem } from "@/lib/types/quote";
import { documentFiltersSchema } from "@/lib/validations/quote.schema";
import { CustomerAvatar } from "@/components/customers/customer-badges";
import { DocumentFilters } from "./document-filters";
import { QuoteBuilder } from "./quote-builder";

// Server pages shared by /drafts, /quotations and /invoices (list, new, edit).

type SearchParams = Promise<Record<string, string | string[] | undefined>>;
type Params = Promise<{ id: string }>;

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

const SECTION_ICON = { drafts: FilePen, quotations: FileText, invoices: ReceiptText } as const;

const sectionDate = (section: DocumentSection, d: DocumentListItem) =>
  section === "invoices" ? d.invoiced_at ?? d.created_at : section === "quotations" ? d.quoted_at ?? d.created_at : d.updated_at;

// ---- List -------------------------------------------------------------------

async function DocumentTable({ section, searchParams }: { section: DocumentSection; searchParams: SearchParams }) {
  const raw = await searchParams;
  const filters = documentFiltersSchema.parse({ search: first(raw.q) || undefined, status: first(raw.status) || undefined });
  const [docs, { tenant }] = await Promise.all([getDocuments(section, filters), getShopSession()]);
  const config = SECTION[section];
  const Icon = SECTION_ICON[section];

  if (docs.length === 0) {
    const filtered = Boolean(filters.search || filters.status);
    return (
      <div className="empty-state">
        <span className="header-icon blue"><Icon size={18} /></span>
        {filtered ? (
          <>
            <strong>Nothing matches these filters</strong>
            Try a different search or status.
          </>
        ) : (
          <>
            <strong>No {config.title.toLowerCase()} yet</strong>
            {section === "invoices"
              ? "Bill a walk-in customer directly, or convert a quotation into an invoice."
              : section === "quotations"
                ? "Create a quotation, or convert a draft when it's ready."
                : "Start a draft to price up a job before sending it."}
            <div className="empty-state-action">
              <Link href={`${config.path}/new`} className="button button-primary">
                <Plus size={14} /> {config.newLabel}
              </Link>
            </div>
          </>
        )}
      </div>
    );
  }

  const total = docs.reduce((sum, d) => sum + (d.status === "cancelled" ? 0 : d.total_amount), 0);
  const dateLabel = section === "drafts" ? "LAST EDITED" : section === "quotations" ? "QUOTED" : "INVOICED";

  return (
    <>
      <div className="table-wrap">
        <table className="document-table">
          <thead>
            <tr>
              <th>NUMBER</th>
              <th>CUSTOMER</th>
              <th>VEHICLE</th>
              <th>{dateLabel}</th>
              <th>STATUS</th>
              <th>TOTAL</th>
              <th><span className="sr-only">Open</span></th>
            </tr>
          </thead>
          <tbody>
            {docs.map((d) => {
              const href = documentHref(d);
              const earlier = earlierNumbers(d);
              return (
                <tr key={d.id}>
                  <td>
                    <Link href={href} className="row-link">
                      <span className="mono strong">{d.quote_number}</span>
                    </Link>
                    {earlier.length > 0 && <span className="doc-earlier">from {earlier.join(" · ")}</span>}
                  </td>
                  <td>
                    {d.customer ? (
                      <div className="customer-name">
                        <CustomerAvatar name={d.customer.name} />
                        <div>
                          <strong>{d.customer.name}</strong>
                          <span className="doc-sub">{d.customer.customer_type}</span>
                        </div>
                      </div>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td>{d.vehicle ? formatVehicle(d.vehicle) : d.custom_vehicle_notes || <span className="doc-sub">No vehicle</span>}</td>
                  <td>{formatDate(sectionDate(section, d), tenant.timezone)}</td>
                  <td><span className={`badge ${STATUS_TONE[d.status] ?? ""}`}>{STATUS_LABEL[d.status] ?? d.status}</span></td>
                  <td className="amount">{formatMoney(d.total_amount, tenant.money)}</td>
                  <td>
                    <Link href={href} className="icon-button" aria-label={`Open ${d.quote_number}`}>
                      <ChevronRight size={16} />
                    </Link>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="table-footer">
        <span>
          Showing {docs.length} {docs.length === 1 ? config.singular.toLowerCase() : config.title.toLowerCase()}
        </span>
        <span>
          Total{section === "quotations" ? " (excluding cancelled)" : ""}: <strong>{formatMoney(total, tenant.money)}</strong>
        </span>
      </div>
    </>
  );
}

export function DocumentListPage({ section, searchParams }: { section: DocumentSection; searchParams: SearchParams }) {
  const config = SECTION[section];
  return (
    <div className="page">
      <div className="page-heading">
        <div>
          <span className="eyebrow">{config.eyebrow}</span>
          <h1>{config.title}</h1>
          <p>{config.description}</p>
        </div>
        <div className="heading-actions">
          <Link href={`${config.path}/new`} className="button button-primary">
            <Plus size={14} /> {config.newLabel}
          </Link>
        </div>
      </div>
      <section className="card customer-card">
        <Suspense>
          <DocumentFilters section={section} />
        </Suspense>
        <Suspense fallback={<div className="empty-state">Loading {config.title.toLowerCase()}…</div>}>
          <DocumentTable section={section} searchParams={searchParams} />
        </Suspense>
      </section>
    </div>
  );
}

// ---- Builder (new / edit) ---------------------------------------------------

function BuilderSkeleton() {
  return (
    <div className="page quote-page">
      <section className="card"><div className="empty-state">Loading…</div></section>
    </div>
  );
}

async function NewDocument({ section, searchParams }: { section: DocumentSection; searchParams: SearchParams }) {
  const raw = await searchParams;
  const customerId = first(raw.customer);
  const { tenant } = await getShopSession();

  // ?customer=<id> pre-selects a customer (from their profile page).
  let initialCustomer: CustomerOption | null = null;
  if (customerId && /^[0-9a-f-]{36}$/i.test(customerId)) {
    const supabase = await createClient();
    const { data } = await supabase
      .from("customers")
      .select("id, name, customer_type, whatsapp_number")
      .eq("id", customerId)
      .maybeSingle();
    initialCustomer = data;
  }

  return (
    <QuoteBuilder
      doc={null}
      section={section}
      title={SECTION[section].newLabel}
      subtitle="Not saved yet"
      money={tenant.money}
      taxRate={tenant.taxRate}
      laborIncludesTax={tenant.pricesIncludeTax}
      allowInternationalPhones={tenant.allowInternationalPhones}
      terms={tenant.quoteTerms}
      initialCustomer={initialCustomer}
    />
  );
}

export function NewDocumentPage({ section, searchParams }: { section: DocumentSection; searchParams: SearchParams }) {
  return (
    <Suspense fallback={<BuilderSkeleton />}>
      <NewDocument section={section} searchParams={searchParams} />
    </Suspense>
  );
}

async function EditDocument({ section, params }: { section: DocumentSection; params: Params }) {
  const { id } = await params;
  const [doc, { tenant }] = await Promise.all([getQuote(id), getShopSession()]);
  if (!doc) notFound();

  // A converted document lives in its new section: /drafts/x → /invoices/x.
  const actual = sectionForStatus(doc.status);
  if (actual !== section) redirect(`${SECTION[actual].path}/${doc.id}`);

  const tz = tenant.timezone;
  const parts = [`Created ${formatDate(doc.created_at, tz)}`];
  if (doc.invoiced_at) parts.push(`invoiced ${formatDate(doc.invoiced_at, tz)}`);
  else if (doc.quoted_at) parts.push(`quoted ${formatDate(doc.quoted_at, tz)}`);
  const earlier = earlierNumbers(doc);
  if (earlier.length) parts.push(`from ${earlier.join(" · ")}`);

  return (
    <QuoteBuilder
      // Remount after every save so the form starts from what was stored.
      key={`${doc.id}:${doc.updated_at}`}
      doc={doc}
      section={section}
      title={`${SECTION[actual].singular} ${doc.quote_number}`}
      subtitle={parts.join(" · ")}
      money={tenant.money}
      taxRate={doc.status === "draft" ? tenant.taxRate : Number(doc.tax_rate)}
      laborIncludesTax={tenant.pricesIncludeTax}
      allowInternationalPhones={tenant.allowInternationalPhones}
      terms={tenant.quoteTerms}
      initialCustomer={null}
    />
  );
}

export function EditDocumentPage({ section, params }: { section: DocumentSection; params: Params }) {
  return (
    <Suspense fallback={<BuilderSkeleton />}>
      <EditDocument section={section} params={params} />
    </Suspense>
  );
}
