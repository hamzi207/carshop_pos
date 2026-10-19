import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ShieldCheck, Users } from "lucide-react";
import { AdminFilters } from "@/components/admin/admin-filters";
import { adminDate, statusBadge } from "@/components/admin/format";
import { RoleSelect, UserActions } from "@/components/admin/user-actions";
import { PaginationBar } from "@/components/ui/pagination-bar";
import { getUsers } from "@/lib/admin-data";
import { parsePagination } from "@/lib/pagination";

export const metadata: Metadata = { title: "Users" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

async function UserList({ searchParams }: { searchParams: SearchParams }) {
  const raw = await searchParams;
  const search = (first(raw.q) ?? "").trim().slice(0, 100);
  const pagination = parsePagination({ page: first(raw.page), limit: first(raw.limit) });
  const result = await getUsers(search, pagination);
  if (result.rows.length === 0 && pagination.page > 1) redirect(search ? `/admin/users?q=${encodeURIComponent(search)}` : "/admin/users");

  if (result.rows.length === 0) {
    return (
      <div className="empty-state">
        <span className="header-icon blue"><Users size={18} /></span>
        <strong>{search ? "No users match" : "No users yet"}</strong>
      </div>
    );
  }

  return (
    <>
      <div className="table-wrap desktop-table">
        <table className="admin-table">
          <thead>
            <tr>
              <th>USER</th>
              <th>SHOP</th>
              <th>ROLE</th>
              <th>LAST SIGN-IN</th>
              <th>JOINED</th>
              <th><span className="sr-only">Password</span></th>
            </tr>
          </thead>
          <tbody>
            {result.rows.map((u) => {
              const badge = statusBadge(u.tenant_status);
              return (
                <tr key={u.id}>
                  <td className="primary-cell">
                    <strong>
                      {u.full_name}
                      {u.is_superadmin && <span className="badge badge-purple admin-super"><ShieldCheck size={11} /> Superadmin</span>}
                    </strong>
                    <span>{u.email}</span>
                  </td>
                  <td className="primary-cell">
                    <strong><Link href={`/admin/tenants/${u.tenant_id}`} className="row-link">{u.tenant_name}</Link></strong>
                    {u.tenant_status !== "active" && <span><span className={badge.tone}>{badge.label}</span></span>}
                  </td>
                  <td><RoleSelect userId={u.id} name={u.full_name} role={u.role} /></td>
                  <td>{adminDate(u.last_sign_in_at)}</td>
                  <td>{adminDate(u.created_at)}</td>
                  <td><UserActions userId={u.id} name={u.full_name} email={u.email} role={u.role} /></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <ul className="mobile-cards" aria-label="Users">
        {result.rows.map((u) => (
          <li key={u.id} className="mobile-card">
            <Link href={`/admin/tenants/${u.tenant_id}`} className="mobile-card-main">
              <span className="mobile-card-top">
                <span className="mobile-card-title">{u.full_name}</span>
                <span className="badge">{u.role === "admin" ? "Admin" : "Staff"}</span>
              </span>
              <span className="mobile-card-meta">
                <span className="mobile-card-muted">{u.email}</span>
                <span>{u.tenant_name}</span>
              </span>
            </Link>
            <span className="mobile-card-actions">
              <UserActions userId={u.id} name={u.full_name} email={u.email} role={u.role} />
            </span>
          </li>
        ))}
      </ul>
      <PaginationBar total={result.total} page={result.page} limit={result.limit} noun={["user", "users"]} />
    </>
  );
}

export default function UsersPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <div className="page">
      <div className="page-heading">
        <div>
          <span className="eyebrow">PLATFORM</span>
          <h1>Users</h1>
          <p>Everyone who signs in, across all shops: reset passwords and change roles.</p>
        </div>
      </div>
      <section className="card customer-card">
        <Suspense>
          <AdminFilters placeholder="Search name, email or shop..." label="Search users" />
        </Suspense>
        <Suspense fallback={<div className="empty-state">Loading users…</div>}>
          <UserList searchParams={searchParams} />
        </Suspense>
      </section>
    </div>
  );
}
