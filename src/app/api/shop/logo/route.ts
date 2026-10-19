import { z } from "zod";
import { getShopSession } from "@/lib/auth";
import { audit, isSuperadmin } from "@/lib/superadmin";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

const MAX_BYTES = 1024 * 1024;

/** PNG / JPEG by their first bytes (the PDF library can only draw these two). */
function imageType(bytes: Uint8Array): { ext: "png" | "jpg"; mime: string } | null {
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return { ext: "png", mime: "image/png" };
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return { ext: "jpg", mime: "image/jpeg" };
  return null;
}

const json = (status: number, body: Record<string, string>) => Response.json(body, { status });

/**
 * Settings → Your shop → Logo. The file goes through the app server (not straight from the browser to Storage):
 * checked here, then stored in the shop's own folder of the shop-assets bucket with the user's session,
 * so the bucket's per-shop policies still apply. Admin-only.
 * A superadmin editing another shop (/admin/tenants/[id]) sends `tenantId`: then the service role
 * writes into that shop's folder, and it's audit-logged.
 */
export async function POST(request: Request) {
  const form = await request.formData().catch(() => null);
  const targetId = form?.get("tenantId");
  const session = await getShopSession();
  let tenantId = session.tenant.id;
  let supabase = await createClient();
  if (typeof targetId === "string" && targetId) {
    if (!z.uuid().safeParse(targetId).success || !(await isSuperadmin(session.userId))) {
      return json(403, { error: "Only superadmins can change another shop's logo." });
    }
    tenantId = targetId;
    supabase = createAdminClient() as unknown as typeof supabase;
  } else if (session.role !== "admin") {
    return json(403, { error: "Only shop admins can change the logo." });
  }

  const file = form?.get("logo");
  if (!(file instanceof File)) return json(400, { error: "Choose an image to upload." });
  if (file.size > MAX_BYTES) return json(400, { error: "Use an image under 1 MB." });
  const bytes = new Uint8Array(await file.arrayBuffer());
  const type = imageType(bytes);
  if (!type) return json(400, { error: "Use a PNG or JPG image." });

  const path = `${tenantId}/logo-${Date.now()}.${type.ext}`;
  const { error: uploadError } = await supabase.storage.from("shop-assets").upload(path, bytes, { contentType: type.mime });
  if (uploadError) {
    console.error("logo upload failed:", uploadError);
    return json(500, { error: "The upload failed. Please try again." });
  }
  const url = supabase.storage.from("shop-assets").getPublicUrl(path).data.publicUrl;
  const { data, error } = await supabase
    .from("tenants")
    .update({ logo_url: url, updated_at: new Date().toISOString() })
    .eq("id", tenantId)
    .select("id");
  if (error || data.length === 0) {
    if (error) console.error("logo save failed:", error);
    return json(500, { error: "We couldn't save the logo. Please try again." });
  }
  if (tenantId !== session.tenant.id) await audit({ adminId: session.userId, action: "tenant.logo", tenantId });
  // (refresh() only works in Server Actions; the form refreshes the page itself.)
  return json(200, { url });
}
