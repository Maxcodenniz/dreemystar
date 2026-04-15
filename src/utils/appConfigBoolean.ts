/**
 * Normalize app_config JSONB `value` from Supabase (boolean, string, or missing).
 */
export function appConfigValueEnabled(value: unknown, defaultEnabled = true): boolean {
  if (value === undefined || value === null) return defaultEnabled;
  if (value === false) return false;
  if (value === true) return true;
  if (typeof value === 'string') {
    const s = value.trim().toLowerCase();
    if (s === 'false' || s === '0') return false;
    if (s === 'true' || s === '1') return true;
  }
  return defaultEnabled;
}
