// IANA timezones for the shop settings picker.

export const DEFAULT_TIMEZONE = "Asia/Karachi";

/** True when the runtime's Intl data knows this IANA name. Works on server and client. */
export function isValidTimeZone(tz: string) {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

export type TimeZoneOption = { value: string; label: string };
export type TimeZoneGroup = { region: string; options: TimeZoneOption[] };

/** "GMT+05:00" → "UTC+05:00"; plain "GMT" → "UTC±00:00". */
function utcOffset(tz: string, at: Date) {
  const part = new Intl.DateTimeFormat("en-US", { timeZone: tz, timeZoneName: "longOffset" })
    .formatToParts(at)
    .find((p) => p.type === "timeZoneName")?.value;
  return !part || part === "GMT" ? "UTC±00:00" : part.replace("GMT", "UTC");
}

/**
 * Every timezone grouped by region ("Asia", "Europe", …), each labelled
 * "Karachi (UTC+05:00)". Offsets reflect today's DST, so build this on the
 * server and pass it down; the browser's Intl data may list zones differently.
 */
export function timeZoneGroups(at = new Date()): TimeZoneGroup[] {
  const zones = new Set(Intl.supportedValuesOf("timeZone"));
  zones.add("UTC");

  const groups = new Map<string, TimeZoneOption[]>();
  for (const tz of zones) {
    const slash = tz.indexOf("/");
    const region = slash === -1 ? "Other" : tz.slice(0, slash);
    const city = (slash === -1 ? tz : tz.slice(slash + 1)).replaceAll("_", " ").replaceAll("/", " / ");
    const options = groups.get(region) ?? [];
    options.push({ value: tz, label: `${city} (${utcOffset(tz, at)})` });
    groups.set(region, options);
  }

  return [...groups.entries()]
    .sort(([a], [b]) => (a === "Other" ? 1 : b === "Other" ? -1 : a.localeCompare(b)))
    .map(([region, options]) => ({ region, options: options.sort((a, b) => a.label.localeCompare(b.label)) }));
}
