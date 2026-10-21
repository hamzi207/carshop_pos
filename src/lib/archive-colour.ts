// Phase 17: an archived organization's row colour in the superadmin's lists. It steps every 30
// days from light yellow (the day it's archived) to dark red after 12 steps (about a year).

const STEP_DAYS = 30;
const DAY_MS = 86_400_000;

/** Background / text per step; each pair meets WCAG AA. */
export const ARCHIVE_PALETTE: { bg: string; fg: string }[] = [
  { bg: "#FEF9C3", fg: "#1e293b" },
  { bg: "#FEF08A", fg: "#1e293b" },
  { bg: "#FDE68A", fg: "#1e293b" },
  { bg: "#FCD34D", fg: "#1e293b" },
  { bg: "#FDBA74", fg: "#1e293b" },
  { bg: "#FB923C", fg: "#1e293b" },
  { bg: "#F97316", fg: "#1e293b" },
  { bg: "#EA580C", fg: "#0f172a" },
  { bg: "#EF4444", fg: "#0f172a" },
  { bg: "#DC2626", fg: "#ffffff" },
  { bg: "#B91C1C", fg: "#ffffff" },
  { bg: "#991B1B", fg: "#ffffff" },
  { bg: "#7F1D1D", fg: "#ffffff" },
];

/** min(12, floor(days archived / 30)); 0 for a future or invalid date. */
export function archiveStep(archivedAt: string, now: Date = new Date()) {
  const days = Math.floor((now.getTime() - new Date(archivedAt).getTime()) / DAY_MS);
  if (!Number.isFinite(days) || days < 0) return 0;
  return Math.min(ARCHIVE_PALETTE.length - 1, Math.floor(days / STEP_DAYS));
}

/** Inline style for the row or card. */
export function archiveStyle(archivedAt: string, now?: Date) {
  const { bg, fg } = ARCHIVE_PALETTE[archiveStep(archivedAt, now)]!;
  return { "--archive-bg": bg, "--archive-fg": fg } as Record<string, string>;
}

/** "Archived today" / "Archived 12 days ago" / "Archived 4 months ago" / "Archived over a year ago". */
export function archiveAge(archivedAt: string, now: Date = new Date()) {
  const days = Math.max(0, Math.floor((now.getTime() - new Date(archivedAt).getTime()) / DAY_MS));
  if (days === 0) return "Archived today";
  if (days < 30) return `Archived ${days} ${days === 1 ? "day" : "days"} ago`;
  if (days >= 365) return "Archived over a year ago";
  const months = Math.floor(days / 30);
  return `Archived ${months} ${months === 1 ? "month" : "months"} ago`;
}
