import { Suspense } from "react";
import type { Metadata } from "next";
import { BarChart3, Plus, Receipt, Users } from "lucide-react";
import { getCustomers } from "@/lib/actions/customers";
import { getShopSession } from "@/lib/auth";
import { formatMoney } from "@/lib/format";
import type { CustomerListItem } from "@/lib/types/customer";
import { customerFiltersSchema } from "@/lib/validations/customer.schema";
import { CustomerFilters } from "@/components/customers/customer-filters";
import { AddCustomerButton, CustomerTable } from "@/components/customers/customer-table";

export const metadata: Metadata = { title: "Customers" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

async function AddCustomerAction() {
  const { tenant } = await getShopSession();
  return <AddCustomerButton allowInternationalPhones={tenant.allowInternationalPhones} />;
}

function CustomerStats({ all, money }: { all: CustomerListItem[]; money: Parameters<typeof formatMoney>[1] }) {
  const b2b = all.filter((c) => c.customer_type !== "Retail Customer").length;
  const outstanding = all.reduce((sum, c) => sum + c.outstanding, 0);
  return (
    <div className="customer-stats">
      <div>
        <span className="customer-stat-icon blue"><Users size={18} /></span>
        <div><strong>{all.length}</strong><span>Total customers</span></div>
      </div>
      <div>
        <span className="customer-stat-icon green"><BarChart3 size={18} /></span>
        <div><strong>{b2b}</strong><span>B2B accounts (dealership + fleet)</span></div>
      </div>
      <div>
        <span className="customer-stat-icon amber"><Receipt size={18} /></span>
        <div><strong>{formatMoney(outstanding, money)}</strong><span>Outstanding balance</span></div>
      </div>
    </div>
  );
}

async function CustomerDirectory({ searchParams }: { searchParams: SearchParams }) {
  const raw = await searchParams;
  const filters = customerFiltersSchema.parse({
    search: first(raw.q) || undefined,
    type: first(raw.type),
  });
  const filtered = Boolean(filters.search || filters.type);
  const [{ tenant }, customers, all] = await Promise.all([
    getShopSession(),
    getCustomers(filters),
    // Stats always describe the whole directory, not the filtered view.
    filtered ? getCustomers() : null,
  ]);

  return (
    <>
      <CustomerStats all={all ?? customers} money={tenant.money} />
      <section className="card customer-card">
        <Suspense>
          <CustomerFilters />
        </Suspense>
        <CustomerTable
          customers={customers}
          money={tenant.money}
          allowInternationalPhones={tenant.allowInternationalPhones}
          filtered={filtered}
        />
      </section>
    </>
  );
}

export default function CustomersPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <div className="page">
      <div className="page-heading">
        <div>
          <span className="eyebrow">B2B CRM</span>
          <h1>Customer Directory</h1>
          <p>Manage business accounts, contacts, and quote history.</p>
        </div>
        <div className="heading-actions">
          <Suspense
            fallback={
              <button type="button" className="button button-primary" disabled>
                <Plus size={14} /> Register Customer
              </button>
            }
          >
            <AddCustomerAction />
          </Suspense>
        </div>
      </div>
      <Suspense fallback={<section className="card"><div className="empty-state">Loading customers…</div></section>}>
        <CustomerDirectory searchParams={searchParams} />
      </Suspense>
    </div>
  );
}
