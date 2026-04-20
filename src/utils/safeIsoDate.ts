/** ISO string for a valid instant, or null if input is missing or not a finite time. */
export function safeToISOString(input: Date | string | number | null | undefined): string | null {
  if (input == null || input === '') return null;
  const d = input instanceof Date ? input : new Date(input);
  const t = d.getTime();
  if (!Number.isFinite(t)) return null;
  return d.toISOString();
}

/** End instant as ISO, from event start + duration (minutes). */
export function safeEventEndISO(
  start: string | Date | null | undefined,
  durationMinutes: number | null | undefined
): string | null {
  if (start == null || start === '') return null;
  const startMs = new Date(start).getTime();
  const dur = Number(durationMinutes);
  if (!Number.isFinite(startMs) || !Number.isFinite(dur)) return null;
  const endMs = startMs + dur * 60_000;
  if (!Number.isFinite(endMs)) return null;
  return new Date(endMs).toISOString();
}
