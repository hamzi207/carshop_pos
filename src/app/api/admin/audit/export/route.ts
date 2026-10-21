import type { NextRequest } from "next/server";
import { describeAction } from "@/components/admin/format";
import { getAuditExport, parseAuditFilters } from "@/lib/audit-data";
import { toCsv } from "@/lib/csv";
import { billingToday } from "@/lib/subscription";
import { getSuperadminSession } from "@/lib/superadmin";

/** /admin/audit CSV export: the page's filters, newest 10,000 rows. */
export async function GET(request: NextRequest) {
  const session = await getSuperadminSession();
  if (!session?.aal2) return new Response("Not found", { status: 404 });
  const params = request.nextUrl.searchParams;
  const rows = await getAuditExport(parseAuditFilters((k) => params.get(k) ?? undefined));
  const csv = toCsv(
    ["When", "Superadmin", "Action", "Description", "Organization", "User", "Reason", "IP", "Details"],
    rows.map((e) => [e.createdAt, e.adminName, e.action, describeAction(e.action, e.details), e.tenantName, e.userEmail, e.reason, e.ip, JSON.stringify(e.details)]),
  );
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="audit-log-${billingToday()}.csv"`,
      "Cache-Control": "private, no-store",
    },
  });
}
