const TONES = ["blue", "purple", "green", "amber", "red"] as const;

function initials(name: string) {
  const words = name.trim().split(/\s+/).filter(Boolean);
  const letters = words.length > 1 ? words[0][0] + words[1][0] : (words[0] ?? "?").slice(0, 2);
  return letters.toUpperCase();
}

/** Stable colour per customer, so the same client always looks the same. */
function toneFor(name: string) {
  let hash = 0;
  for (const ch of name) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return TONES[hash % TONES.length];
}

export function CustomerAvatar({ name, large }: { name: string; large?: boolean }) {
  return (
    <span className={`customer-avatar customer-${toneFor(name)}${large ? " large" : ""}`} aria-hidden="true">
      {initials(name)}
    </span>
  );
}

const TYPE_TONE: Record<string, string> = {
  Dealership: "badge-blue",
  "Fleet Account": "badge-purple",
};

export function CustomerTypeBadge({ type }: { type: string }) {
  return <span className={`badge ${TYPE_TONE[type] ?? ""}`}>{type}</span>;
}
