import { Suspense, type ReactNode } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowLeft,
  FileText,
  Mail,
  MapPin,
  MessageCircle,
  Phone,
  Receipt,
  StickyNote,
  User,
} from "lucide-react";
import { getCustomer } from "@/lib/actions/customers";
import { getShopSession } from "@/lib/auth";
import { formatDate, formatMoney, formatVehicle } from "@/lib/format";
import { formatPhone, whatsappLink } from "@/lib/phone";
import { CustomerAvatar, CustomerTypeBadge } from "@/components/customers/customer-badges";
import { CustomerProfileActions } from "@/components/customers/customer-profile-actions";

export const metadata: Metadata = { title: "Customer" };

type Params = Promise<{ id: string }>;

const STATUS_TONE: Record<string, string> = {
  paid: "badge-green",
  invoiced: "badge-amber",
  accepted: "badge-blue",
  sent: "badge-blue",
  cancelled: "badge-red",
};

function Detail({ icon, label, value, mono }: { icon: ReactNode; label: string; value: string | null; mono?: boolean }) {
  return (
    <div>
      {icon}
      <span>{label}</span>
      <strong className={mono ? "mono" : undefined}>{value || "—"}</strong>
    </div>
  );
}

async function CustomerProfile({ params }: { params: Params }) {
  const { id } = await params;
  const [customer, { tenant }] = await Promise.all([getCustomer(id), getShopSession()]);
  if (!customer) notFound();

  const greeting = `Hello ${customer.contact_person || customer.name}, this is ${tenant.name}.`;
  const iconProps = { size: 15, className: "icon" };

  return (
    <>
      <div className="page-heading">
        <div className="profile-heading">
          <CustomerAvatar name={customer.name} large />
          <div>
            <span className="eyebrow">CUSTOMER PROFILE</span>
            <h1>{customer.name}</h1>
            <div className="profile-badges">
              <CustomerTypeBadge type={customer.customer_type} />
              <span className="badge">Customer since {formatDate(customer.created_at, tenant.timezone)}</span>
            </div>
          </div>
        </div>
        <div className="heading-actions">
          <CustomerProfileActions
            customer={customer}
            allowInternationalPhones={tenant.allowInternationalPhones}
            hasQuotes={customer.quotes.length > 0}
          />
          <a
            className="button button-success"
            href={whatsappLink(customer.whatsapp_number, greeting)}
            target="_blank"
            rel="noopener noreferrer"
          >
            <MessageCircle size={14} /> Message on WhatsApp
          </a>
        </div>
      </div>

      <div className="customer-profile-grid">
        <section className="card drawer-section profile-details">
          <div className="section-title"><h3>Account details</h3></div>
          <div className="details-list">
            <Detail icon={<User {...iconProps} />} label="Primary contact" value={customer.contact_person} />
            <Detail icon={<MessageCircle {...iconProps} />} label="WhatsApp" value={formatPhone(customer.whatsapp_number)} />
            <Detail icon={<Phone {...iconProps} />} label="Other phone" value={formatPhone(customer.phone)} />
            <Detail icon={<Mail {...iconProps} />} label="Email" value={customer.email} />
            <Detail icon={<MapPin {...iconProps} />} label="Billing address" value={customer.billing_address} />
            <Detail icon={<Receipt {...iconProps} />} label="NTN / Tax ID" value={customer.tax_id} mono />
          </div>
          {customer.notes && (
            <div className="profile-notes">
              <StickyNote size={14} />
              <p>{customer.notes}</p>
            </div>
          )}
        </section>

        <section className="card">
          <div className="card-header">
            <div>
              <h2>Purchase &amp; quote history</h2>
              <p>
                {customer.outstanding > 0
                  ? `${formatMoney(customer.outstanding, tenant.money)} outstanding`
                  : "No outstanding balance"}
              </p>
            </div>
          </div>
          {customer.quotes.length === 0 ? (
            <div className="empty-state">
              <span className="header-icon blue"><FileText size={18} /></span>
              <strong>No quotes or invoices yet</strong>
              Quotes created for this customer will appear here.
            </div>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>NUMBER</th>
                    <th>DATE</th>
                    <th>VEHICLE</th>
                    <th>STATUS</th>
                    <th>TOTAL</th>
                  </tr>
                </thead>
                <tbody>
                  {customer.quotes.map((q) => (
                    <tr key={q.id}>
                      <td className="mono strong">{q.quote_number}</td>
                      <td>{formatDate(q.created_at, tenant.timezone)}</td>
                      <td>{q.vehicle ? formatVehicle(q.vehicle) : q.custom_vehicle_notes || "—"}</td>
                      <td>
                        <span className={`badge ${STATUS_TONE[q.status] ?? ""}`}>
                          {q.status[0].toUpperCase() + q.status.slice(1)}
                        </span>
                      </td>
                      <td className="amount">{formatMoney(q.total_amount, tenant.money)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </>
  );
}

export default function CustomerPage({ params }: { params: Params }) {
  return (
    <div className="page">
      <Link href="/customers" className="back-link">
        <ArrowLeft size={14} /> All customers
      </Link>
      <Suspense fallback={<section className="card"><div className="empty-state">Loading customer…</div></section>}>
        <CustomerProfile params={params} />
      </Suspense>
    </div>
  );
}
