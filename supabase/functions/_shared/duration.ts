const ISO_DURATION = /^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/;

/** Parses a YouTube ISO 8601 duration such as "PT1H2M3S". Returns null if invalid. */
export function parseIsoDuration(value: string | null | undefined): number | null {
  if (!value) return null;
  const match = ISO_DURATION.exec(value);
  if (!match || value === "P" || value.endsWith("T")) return null;
  const [, days, hours, minutes, seconds] = match.map((part) => Number(part ?? 0));
  return days * 86400 + hours * 3600 + minutes * 60 + seconds;
}
