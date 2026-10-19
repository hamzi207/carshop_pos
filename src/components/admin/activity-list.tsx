import Link from "next/link";
import type { ActivityEntry } from "@/lib/admin-data";
import { adminDateTime, describeAction } from "./format";

/** Audit log rows in words: who, what, which shop, when. */
export function ActivityList({ entries, showShop = false }: { entries: ActivityEntry[]; showShop?: boolean }) {
  if (entries.length === 0) return <div className="empty-state">Nothing logged yet.</div>;
  return (
    <ul className="admin-activity">
      {entries.map((e) => (
        <li key={e.id}>
          <div>
            <strong>{e.adminName}</strong> · {describeAction(e.action, e.details)}
            {showShop && e.tenantId && (
              <>
                {" "}· <Link href={`/admin/tenants/${e.tenantId}`} className="detail-link">{e.tenantName ?? "Deleted shop"}</Link>
              </>
            )}
          </div>
          <time dateTime={e.createdAt}>{adminDateTime(e.createdAt)}</time>
        </li>
      ))}
    </ul>
  );
}
