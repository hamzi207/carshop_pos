import "server-only";
import type { createAdminClient } from "@/lib/supabase/admin";
import { proofError } from "@/lib/validations/subscription.schema";

// Payment screenshots (Phase 17, deliverable 9): a private bucket that only the server reads and
// writes, one folder per organization (submit_subscription_payment checks the folder).

/** Uploads a screenshot / receipt under the organization's folder; { path: null } without a file. */
export async function uploadProof(admin: ReturnType<typeof createAdminClient>, tenantId: string, file: File | null) {
  if (!file || file.size === 0) return { path: null };
  const problem = proofError(file);
  if (problem) return { error: problem };
  const ext = file.type === "application/pdf" ? "pdf" : file.type.split("/")[1].replace("jpeg", "jpg");
  const path = `${tenantId}/${crypto.randomUUID()}.${ext}`;
  const { error } = await admin.storage.from("subscription-proofs").upload(path, file, { contentType: file.type });
  if (error) {
    console.error("subscription proof upload failed:", error);
    return { error: "We couldn't upload the screenshot. Please try again." };
  }
  return { path };
}
