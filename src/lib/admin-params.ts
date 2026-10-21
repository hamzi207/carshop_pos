import "server-only";
import { notFound } from "next/navigation";

/** /admin/tenants/[id]/…: the organization id from the route, or 404. */
export async function tenantParam(params: Promise<{ id: string }>) {
  const { id } = await params;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) notFound();
  return id;
}
