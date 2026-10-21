import { Suspense } from "react";
import { createClient } from "@/lib/supabase/server";
import { AnnouncementItems } from "./announcement-items";

/**
 * Platform announcements aimed at this organization (Phase 17, deliverable 5), read through RLS
 * (only live ones it's targeted by). Reads the session: render inside <Suspense>.
 */
async function Announcements() {
  const supabase = await createClient();
  const { data } = await supabase.from("announcements").select("id, message, tone").order("starts_at", { ascending: false }).limit(3);
  if (!data?.length) return null;
  return <AnnouncementItems items={data.map((a) => ({ id: a.id, message: a.message, tone: a.tone === "warning" ? "warning" : "info" }))} />;
}

export function AnnouncementBanner() {
  return (
    <Suspense>
      <Announcements />
    </Suspense>
  );
}
