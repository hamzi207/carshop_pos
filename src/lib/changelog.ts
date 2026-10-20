// "What's new" (RF-16.3): what changed for the people using the app, newest first. Add an entry when a
// phase ships something users will notice. `id` is stored per user (profiles.whats_new_seen) to clear the
// top-bar dot, so never change or reuse one; at most 40 characters.

export type ChangelogEntry = {
  id: string;
  /** yyyy-mm-dd */
  date: string;
  title: string;
  items: string[];
};

export const CHANGELOG: ChangelogEntry[] = [
  {
    id: "2026-10-20-productlogik",
    date: "2026-10-20",
    title: "Welcome to ProductLogik POS",
    items: [
      "CarShop.Pk POS is now ProductLogik POS, with a new look. Everything you had before is still here.",
      "Pick your own document colour in Settings → Profile. Your A4 PDFs, share links and emails use it; POS slips stay black.",
      "Urdu names, addresses and notes now print correctly on PDFs and POS slips.",
      "Dark mode: choose Light, Dark or System from your name in the top bar. Documents always stay light.",
      "Install it like an app: use your browser's Install or Add to Home Screen option.",
    ],
  },
];

export const LATEST_CHANGELOG_ID = CHANGELOG[0]?.id ?? null;
